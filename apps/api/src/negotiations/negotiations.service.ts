import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException,
  type OnModuleInit, UnauthorizedException,
} from '@nestjs/common';
import type { Order as DbOrder } from '@prisma/client';
import { Observable, ReplaySubject } from 'rxjs';
import type {
  AgentRequestResult, ConfirmResult, NegotiationEvent, NegotiationStatus, NegotiationTask,
} from '@botir/shared';
import {
  computeTotal, detectLang, isComplete, LlmError, rankContenders, winnerReason, type AgentBusiness, type Contender, type NegotiationResult,
  type Product, type UserTask,
} from '../agents';
import type { Offer } from '../agents/shared';
import { errMsg, parseJson } from '../common/http';
import { PrismaAgentStore, sessionIdOf } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { TurnRecorder } from '../knowledge/turn-recorder.service';
import { PAYMENT_LINK, type PaymentLinkProvider } from '../payments/payment-link';
import { AGENTS, type Agents } from './agents.provider';
import {
  assertConfirmable, ConfirmRace, isExpired, isRaceError, OrderExistsError, orderDetails, type ConfirmOptions,
} from './confirm-rules';
import { LaneMapper, toOfferPayload } from './event-mapper';
import { envInt, MAX_TASKS, MAX_TEXT_CHARS, RateLimiter, startOfTashkentDay, tooMany } from './request-limits';

const MAX_BUSINESSES_PER_TASK = 3;
const STALE_RUNNING_MS = 10 * 60 * 1000;
// Client-facing texts (Uzbek). Raw errors go to the log only.
const TECH_ERROR = "Texnik xato, muzokara to'xtatildi. Qaytadan urinib ko'ring.";
const NO_TASKS = "So'rovdan vazifa topilmadi. Qanday xizmat kerakligini yozing (restoran, do'kon, avtoservis, klinika, go'zallik saloni yoki boshqa xizmat).";
const TOO_MANY_TASKS = `Bir so'rovda ko'pi bilan ${MAX_TASKS} ta vazifa bo'lishi mumkin. So'rovni bo'lib yuboring.`;
const KEPT_OFFER = ' Oxirgi tekshirilgan taklif saqlandi, uni tasdiqlashingiz mumkin.';

interface Live {
  subject: ReplaySubject<NegotiationEvent>;
  seq: number;
}

@Injectable()
export class NegotiationsService implements OnModuleInit {
  private readonly logger = new Logger('Negotiations');
  private readonly live = new Map<string, Live>();
  private readonly limiter = new RateLimiter(envInt('AGENT_RATE_LIMIT', 5));
  private readonly dailyCap = envInt('AGENT_DAILY_CAP', 200);

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PAYMENT_LINK) private readonly payments: PaymentLinkProvider,
    @Inject(PrismaAgentStore) private readonly store: PrismaAgentStore,
    @Inject(TurnRecorder) private readonly turns: TurnRecorder,
  ) {}

  /** After a restart nothing runs them any more: old 'running' negotiations end as 'failed' (with a replayable event). */
  async onModuleInit(): Promise<void> {
    try {
      const stale = await this.db.negotiation.findMany({
        where: { status: 'running', deletedAt: null, createdAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } }, select: { id: true },
      });
      for (const { id } of stale) {
        await this.db.negotiation.update({ where: { id }, data: { status: 'failed' } });
        await this.emit(id, { type: 'error', error: "Server qayta ishga tushdi, muzokara to'xtadi. So'rovni qaytadan yuboring." });
        await this.emit(id, { type: 'status', status: 'failed' });
      }
      if (stale.length) this.logger.warn(`${stale.length} stale running negotiation(s) marked failed`);
    } catch (e) {
      this.logger.warn(`stale cleanup: ${errMsg(e)}`);
    }
  }

  /** Returns immediately; parsing + negotiations run in the background and stream over SSE. All limits come before any AI call. */
  async request(userId: string, text: string, ip?: string, district?: string): Promise<AgentRequestResult> {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) throw new BadRequestException("So'rov matni bo'sh");
    if (clean.length > MAX_TEXT_CHARS) throw new BadRequestException(`So'rov juda uzun: ${MAX_TEXT_CHARS} belgigacha yozing.`);
    const today = await this.db.negotiation.count({ where: { createdAt: { gte: startOfTashkentDay() } } });
    if (today >= this.dailyCap) throw tooMany("Bugungi AI so'rovlar chegarasi tugadi. Ertaga qayta urinib ko'ring.");
    const keys = [ip ? `ip:${ip}` : '', userId && userId !== 'anonymous' ? `user:${userId}` : ''].filter(Boolean);
    if (!this.limiter.take(keys.length ? keys : ['anonymous'])) {
      throw tooMany(`Juda ko'p so'rov: 10 daqiqada ${this.limiter.limit} tagacha. Birozdan keyin qayta urinib ko'ring.`);
    }
    const neg = await this.db.negotiation.create({ data: { userId: userId || 'anonymous', text: clean, tasks: '[]' } });
    this.live.set(neg.id, { subject: new ReplaySubject<NegotiationEvent>(), seq: 0 });
    void this.emit(neg.id, { type: 'status', status: 'running' });
    void this.runAll(neg.id, neg.userId, clean, district)
      .catch((e: unknown) => this.fail(neg.id, e instanceof LlmError ? e.message : TECH_ERROR, errMsg(e)));
    return { negotiationId: neg.id, tasks: [] };
  }

  /** Live: replay + follow. Finished/restarted: replay from the DB log. */
  stream(id: string): Observable<NegotiationEvent> {
    const live = this.live.get(id);
    if (live) return live.subject.asObservable();
    return new Observable<NegotiationEvent>((sub) => {
      void this.db.negotiationEventLog
        .findMany({ where: { negotiationId: id }, orderBy: { seq: 'asc' } })
        .then((rows) => {
          if (rows.length === 0) sub.next({ type: 'error', error: 'negotiation not found' });
          for (const r of rows) sub.next(JSON.parse(r.event) as NegotiationEvent);
          sub.complete();
        })
        .catch((e: unknown) => sub.error(e));
    });
  }

  async get(id: string, viewerId: string | null = null) {
    const neg = await this.findNegotiation(id);
    await this.assertOwner(neg.userId, viewerId);
    const messages = await this.db.negotiationMessage.findMany({ where: { negotiationId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return {
      id: neg.id, userId: neg.userId, status: neg.status as NegotiationStatus, tasks: parseJson<NegotiationTask[]>(neg.tasks, []),
      createdAt: neg.createdAt.toISOString(), updatedAt: neg.updatedAt.toISOString(),
      messages: messages.map((m) => ({ ...m, payload: JSON.parse(m.payload) as unknown })),
    };
  }

  /**
   * Human pressed "Tasdiqlayman": the business's kept offer → one Order + payment link.
   * Only for an agreed negotiation, a live (not expired) offer, one order per offer and one business per task.
   * The negotiation row is the lock: a conditional updateMany on (status, updatedAt) serializes parallel confirms.
   */
  async confirm(negotiationId: string, businessId: string, opts: ConfirmOptions = {}): Promise<ConfirmResult> {
    if (!businessId) throw new BadRequestException('businessId kerak');
    const neg = await this.findNegotiation(negotiationId);
    await this.assertOwner(neg.userId, opts.viewerId ?? null);
    const placed = await this.ordersOf(negotiationId);
    const existing = placed.find(businessId, opts.taskId ?? null);
    if (existing) throw await this.orderExists(existing);
    assertConfirmable(neg.status);
    const offer = await this.db.agentOffer.findFirst({
      where: { negotiationId, businessId, status: 'proposed', deletedAt: null, ...(opts.taskId ? { taskId: opts.taskId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (!offer) throw new ConflictException("Bu biznes bilan kelishilgan taklif yo'q.");
    if (isExpired(offer.createdAt)) throw new GoneException("Taklif muddati o'tgan. So'rovni qaytadan yuboring.");
    if (placed.taskTaken(businessId, offer.taskId)) throw new ConflictException('Bu vazifa uchun boshqa biznes allaqachon tasdiqlangan.');

    const rows = await this.db.catalogItem.findMany({ where: { businessId } });
    const products: Product[] = rows.map((p) => ({ id: p.id, businessId: p.businessId, name: p.name, price: p.price, unit: p.unit }));
    const items = parseJson<Offer['items']>(offer.items, []);
    // Upsell is priced from the catalog by code, at full price (discount applies to the negotiated offer only).
    const upsell = opts.acceptUpsell ? parseJson<Offer['upsell'] | null>(offer.upsell, null) : null;
    const upsellPrice = upsell ? computeTotal(products, { items: [{ productId: upsell.productId, qty: 1 }], discountPct: 0 }) : 0;
    const withUpsell = upsell !== null && upsellPrice > 0;
    const total = offer.total + (withUpsell ? upsellPrice : 0);
    const payload = toOfferPayload(
      {
        id: offer.id, sessionId: offer.sessionId, discountPct: offer.discountPct, status: 'accepted', total,
        items: withUpsell && upsell ? [...items, { productId: upsell.productId, qty: 1 }] : items,
      },
      products,
    );
    const tasks = parseJson<NegotiationTask[]>(neg.tasks, []);
    const task = offer.taskId ? tasks.find((t) => t.taskId === offer.taskId) : tasks.length === 1 ? tasks[0] : undefined;

    let order: DbOrder;
    try {
      order = await this.db.$transaction(async (tx) => {
        const lock = await tx.negotiation.updateMany({
          where: { id: negotiationId, status: neg.status, updatedAt: neg.updatedAt },
          data: { status: 'confirmed', updatedAt: new Date(Math.max(Date.now(), neg.updatedAt.getTime() + 1)) },
        });
        if (lock.count !== 1) throw new ConfirmRace();
        const taken = await tx.agentOffer.updateMany({ where: { id: offer.id, status: 'proposed' }, data: { status: 'accepted' } });
        if (taken.count !== 1) throw new ConfirmRace();
        return tx.order.create({
          data: {
            businessId, userId: neg.userId, negotiationId, offerId: offer.id, items: JSON.stringify(payload.items),
            total, discountPct: offer.discountPct, status: 'confirmed', details: orderDetails(task),
          },
        });
      });
    } catch (e) {
      if (!isRaceError(e)) throw e;
      const winner = (await this.ordersOf(negotiationId)).find(businessId, offer.taskId);
      if (winner) throw await this.orderExists(winner);
      throw new ConflictException("Bu muzokara hozir boshqa so'rov bilan tasdiqlanmoqda. Qayta urinib ko'ring.");
    }
    const pay = await this.payments.createPaymentLink(order);
    await this.emit(negotiationId, { type: 'status', status: 'confirmed' });
    return { orderId: order.id, paymentLink: pay.payUrl, total, upsellAccepted: withUpsell };
  }

  private async findNegotiation(id: string) {
    const neg = await this.db.negotiation.findFirst({ where: { id, deletedAt: null } });
    if (!neg) throw new NotFoundException('Muzokara topilmadi');
    return neg;
  }

  /** A registered user's negotiation needs their Bearer token. Guest / Telegram negotiations: anyone with the link (as before). */
  private async assertOwner(ownerId: string, viewerId: string | null): Promise<void> {
    if (viewerId === ownerId) return;
    const registered = await this.db.user.findFirst({ where: { id: ownerId }, select: { id: true } });
    if (!registered) return;
    if (!viewerId) throw new UnauthorizedException('Bu muzokara uchun hisobingizga kiring');
    throw new ForbiddenException('Bu muzokara boshqa foydalanuvchiga tegishli');
  }

  /** Orders of a negotiation with the task of each (via its offer). A null task (older data) counts as the same task. */
  private async ordersOf(negotiationId: string) {
    const orders = await this.db.order.findMany({ where: { negotiationId, deletedAt: null } });
    const offerIds = orders.flatMap((o) => (o.offerId ? [o.offerId] : []));
    const offers = offerIds.length
      ? await this.db.agentOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, taskId: true } })
      : [];
    const taskOf = (o: DbOrder): string | null => offers.find((x) => x.id === o.offerId)?.taskId ?? null;
    const sameTask = (o: DbOrder, taskId: string | null): boolean => !taskId || !taskOf(o) || taskOf(o) === taskId;
    return {
      find: (businessId: string, taskId: string | null) => orders.find((o) => o.businessId === businessId && sameTask(o, taskId)),
      taskTaken: (businessId: string, taskId: string | null) => orders.some((o) => o.businessId !== businessId && sameTask(o, taskId)),
    };
  }

  /** 409 for an order that already exists; the payment link is idempotent per order, so the client can still pay. */
  private async orderExists(order: DbOrder): Promise<OrderExistsError> {
    const link = await this.payments.createPaymentLink(order).then((p) => p.payUrl).catch(() => undefined);
    return new OrderExistsError(order.id, link);
  }

  private async runAll(negId: string, userId: string, text: string, district?: string): Promise<void> {
    const lang = detectLang(text);
    const memory = await this.agents.memory.factsFor(userId);
    const tasks = await this.agents.personalAgent.parse(text, memory.map((f) => `- ${f}`).join('\n'), district);
    const shared: NegotiationTask[] = tasks.map((t, i) => ({
      taskId: `${negId}:${i}`, category: t.category, need: t.need, when: t.when, where: t.area, people: t.people, wishes: t.wishes,
    }));
    await this.db.negotiation.update({ where: { id: negId }, data: { tasks: JSON.stringify(shared) } });
    this.logger.log(`${negId}: ${tasks.length} task(s) ${JSON.stringify(tasks)}`);
    if (tasks.length === 0) return this.fail(negId, NO_TASKS);
    if (tasks.length > MAX_TASKS) return this.fail(negId, TOO_MANY_TASKS);

    const results = (await Promise.all(tasks.map((task, i) => this.runTask(negId, shared[i].taskId, userId, text, lang, task, memory)))).flat();
    const best = results.find((r) => r.status === 'agreed') ?? results.find((r) => r.transcript.length > 0);
    if (best) {
      // Memory once per request (not per lane): user text + the agreed dialogue.
      void this.agents.memory
        .extract({ userId, sessionId: best.sessionId, userText: text, transcript: best.transcript })
        .catch((e: unknown) => this.logger.warn(`memory ${negId}: ${errMsg(e)}`));
    }
    // A confirmable offer (agreed, or kept after a technical stop) → agreed. A technical failure is never "rejected".
    const status: NegotiationStatus = results.some((r) => r.offer)
      ? 'agreed'
      : results.length === 0 || results.some((r) => r.status === 'timeout') ? 'failed' : 'rejected';
    await this.db.negotiation.update({ where: { id: negId }, data: { status } });
    await this.emit(negId, { type: 'status', status });
    this.close(negId);
  }

  /** One task: all matching businesses (cap 3) negotiate in parallel, then a deterministic winner is emitted. */
  private async runTask(
    negId: string, taskId: string, userId: string, text: string, lang: 'uz' | 'ru', task: UserTask, memory: string[],
  ): Promise<NegotiationResult[]> {
    const businesses = (await this.agents.personalAgent.findBusinesses(task)).slice(0, MAX_BUSINESSES_PER_TASK);
    if (businesses.length === 0) {
      await this.db.auditFinding.create({ data: { sessionId: negId, type: 'not_found', detail: `${task.category}: ${task.need}`, at: new Date() } });
      await this.emit(negId, { type: 'error', error: `${task.need}: mos biznes topilmadi.` });
      return [];
    }
    const results = await Promise.all(
      businesses.map((b) => this.runLane(negId, taskId, userId, lang, task, b, memory, businesses.length - 1)),
    );
    if (businesses.length > 1) await this.emitWinner(negId, taskId, lang, task, businesses, results, memory);
    return results;
  }

  /** Winner = cheapest COMPLETE agreed offer (see isComplete). None complete → no winner, an honest message instead. */
  private async emitWinner(
    negId: string, taskId: string, lang: 'uz' | 'ru', task: UserTask, businesses: AgentBusiness[], results: NegotiationResult[], memory: string[],
  ): Promise<void> {
    const agreed = results.flatMap((r) => {
      const business = businesses.find((b) => b.id === r.businessId);
      return r.status === 'agreed' && r.offer && business ? [{ business, offer: r.offer }] : [];
    });
    if (agreed.length === 0) return;
    const contenders: Contender[] = await Promise.all(agreed.map(async (c) => ({ ...c, products: await this.store.getProducts(c.business.id) })));
    const ranked = rankContenders(contenders.filter((c) => isComplete(c, task)));
    const w = ranked[0];
    if (!w) {
      await this.emit(negId, {
        type: 'error',
        error: `${task.need}: hech bir biznes so'rovni to'liq bajaradigan taklif bermadi (mahsulot, miqdor yoki narx mos emas), eng yaxshi taklif tanlanmadi.`,
      });
      return;
    }
    await this.emit(negId, {
      type: 'best_offer', taskId, businessId: w.business.id, businessName: w.business.name,
      offer: toOfferPayload(w.offer, w.products ?? [], await this.issuedAt(w.offer.id)),
      winner: true, reason: winnerReason(ranked, lang, businesses.length),
      ranking: ranked.map((r) => ({
        businessId: r.business.id, businessName: r.business.name, price: r.offer.total, discountPct: r.offer.discountPct,
      })),
      ...(memory.length ? { appliedMemory: memory } : {}),
    });
  }

  private async runLane(
    negId: string, taskId: string, userId: string, lang: 'uz' | 'ru', task: UserTask, business: AgentBusiness, memory: string[], competitors: number,
  ): Promise<NegotiationResult> {
    const offerIds: string[] = [];
    try {
      const products = await this.store.getProducts(business.id);
      const mapper = new LaneMapper(negId, taskId, business.id, products, (e) => void this.emit(negId, e), memory);
      const result = await this.agents.negotiator.run({
        sessionId: sessionIdOf(negId, business.id), userId, business, task, lang, memory, competitors,
        onEvent: (_sid, e) => {
          if (e.type === 'offer') offerIds.push(e.offer.id);
          mapper.handle(e);
        },
        onTurn: this.turns.session(business.id, 'negotiation'),
      });
      mapper.finish(result.status);
      await this.settleOffers(offerIds, taskId, result.offer?.id);
      if (result.notice) {
        await this.emit(negId, { type: 'error', error: `${business.name}: ${result.notice}${result.offer ? KEPT_OFFER : ''}` });
      }
      if (result.offer) {
        await this.emit(negId, {
          type: 'best_offer', taskId, businessId: business.id, businessName: business.name,
          offer: toOfferPayload(result.offer, products, await this.issuedAt(result.offer.id)),
          ...(memory.length ? { appliedMemory: memory } : {}),
        });
      }
      void this.postSession(result, products, business.maxDiscountPct);
      return result;
    } catch (e) {
      this.logger.error(`${negId}/${business.id}: ${errMsg(e)}`);
      await this.settleOffers(offerIds, taskId).catch(() => undefined);
      await this.emit(negId, { type: 'error', error: `${business.name}: ${TECH_ERROR}` });
      return { sessionId: sessionIdOf(negId, business.id), userId, businessId: business.id, status: 'timeout', transcript: [], rounds: 0 };
    }
  }

  /** Tags the lane's offers with their task; every offer except the kept one is declined, so confirm can only take the kept one. */
  private async settleOffers(ids: string[], taskId: string, keepId?: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.agentOffer.updateMany({ where: { id: { in: ids } }, data: { taskId } });
    await this.db.agentOffer.updateMany({ where: { id: { in: ids.filter((id) => id !== keepId) }, status: 'proposed' }, data: { status: 'declined' } });
  }

  /** The offer card's validUntil counts from the same moment the server checks on confirm. */
  private async issuedAt(offerId: string): Promise<Date> {
    const row = await this.db.agentOffer.findUnique({ where: { id: offerId }, select: { createdAt: true } });
    return row?.createdAt ?? new Date();
  }

  /** Auditor after the session (best effort, never blocks the stream). Memory is extracted once per request in runAll. */
  private async postSession(r: NegotiationResult, products: Product[], maxDiscountPct: number) {
    await this.agents.auditor
      .review({ sessionId: r.sessionId, businessId: r.businessId, transcript: r.transcript, products, maxDiscountPct })
      .catch((e: unknown) => this.logger.warn(`post-session ${r.sessionId}: ${errMsg(e)}`));
  }

  /** `error` is shown to the client; `detail` (raw) goes to the log only. */
  private async fail(negId: string, error: string, detail = error): Promise<void> {
    this.logger.error(`${negId}: ${detail}`);
    await this.emit(negId, { type: 'error', error });
    await this.db.negotiation.update({ where: { id: negId }, data: { status: 'failed' } }).catch(() => undefined);
    await this.emit(negId, { type: 'status', status: 'failed' });
    this.close(negId);
  }

  private async emit(negId: string, e: NegotiationEvent): Promise<void> {
    const live = this.live.get(negId);
    const seq = live ? live.seq++ : await this.db.negotiationEventLog.count({ where: { negotiationId: negId } });
    live?.subject.next(e);
    await this.db.negotiationEventLog.create({ data: { negotiationId: negId, seq, event: JSON.stringify(e) } });
    if (e.type === 'message') {
      const m = e.message;
      await this.db.negotiationMessage.upsert({
        where: { id: m.id },
        create: { id: m.id, negotiationId: negId, businessId: m.businessId, fromAgent: m.fromAgent, round: m.round, text: m.text, payload: JSON.stringify(m.payload), createdAt: new Date(m.createdAt) },
        update: {},
      });
    }
  }

  /** Completes the live stream; keeps the replay buffer for late subscribers for 10 min. */
  private close(negId: string): void {
    const live = this.live.get(negId);
    if (!live) return;
    live.subject.complete();
    setTimeout(() => this.live.delete(negId), 10 * 60 * 1000).unref();
  }
}
