import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';
import type {
  AgentRequestResult, ConfirmResult, NegotiationEvent, NegotiationStatus, NegotiationTask,
} from '@botir/shared';
import {
  computeTotal, detectLang, rankContenders, winnerReason, type AgentBusiness, type Contender, type NegotiationResult, type Product, type UserTask,
} from '../agents';
import type { Offer } from '../agents/shared';
import { errMsg, parseJson } from '../common/http';
import { PrismaAgentStore, sessionIdOf } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { PAYMENT_LINK, type PaymentLinkProvider } from '../payments/payment-link';
import { AGENTS, type Agents } from './agents.provider';
import { LaneMapper, toOfferPayload } from './event-mapper';

const MAX_BUSINESSES_PER_TASK = 3;

interface Live {
  subject: ReplaySubject<NegotiationEvent>;
  seq: number;
}

@Injectable()
export class NegotiationsService {
  private readonly logger = new Logger('Negotiations');
  private readonly live = new Map<string, Live>();

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AGENTS) private readonly agents: Agents,
    @Inject(PAYMENT_LINK) private readonly payments: PaymentLinkProvider,
    @Inject(PrismaAgentStore) private readonly store: PrismaAgentStore,
  ) {}

  /** Returns immediately; parsing + negotiations run in the background and stream over SSE. */
  async request(userId: string, text: string): Promise<AgentRequestResult> {
    if (!text?.trim()) throw new BadRequestException('text is required');
    const neg = await this.db.negotiation.create({ data: { userId: userId || 'anonymous', text, tasks: '[]' } });
    this.live.set(neg.id, { subject: new ReplaySubject<NegotiationEvent>(), seq: 0 });
    void this.emit(neg.id, { type: 'status', status: 'running' });
    void this.runAll(neg.id, neg.userId, text).catch((e: unknown) => this.fail(neg.id, errMsg(e)));
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

  async get(id: string) {
    const neg = await this.db.negotiation.findFirst({ where: { id, deletedAt: null } });
    if (!neg) throw new NotFoundException('negotiation not found');
    const messages = await this.db.negotiationMessage.findMany({ where: { negotiationId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return {
      id: neg.id, userId: neg.userId, status: neg.status as NegotiationStatus, tasks: parseJson<NegotiationTask[]>(neg.tasks, []),
      createdAt: neg.createdAt.toISOString(), updatedAt: neg.updatedAt.toISOString(),
      messages: messages.map((m) => ({ ...m, payload: JSON.parse(m.payload) as unknown })),
    };
  }

  /** Human pressed "Tasdiqlayman": latest proposed offer of that business → confirmed Order + payment link. */
  async confirm(negotiationId: string, businessId: string, acceptUpsell = false): Promise<ConfirmResult> {
    if (!businessId) throw new BadRequestException('businessId is required');
    const neg = await this.db.negotiation.findFirst({ where: { id: negotiationId, deletedAt: null } });
    if (!neg) throw new NotFoundException('negotiation not found');
    const existing = await this.db.order.findFirst({ where: { negotiationId, businessId, deletedAt: null } });
    if (existing) {
      const pay = await this.payments.createPaymentLink(existing);
      return { orderId: existing.id, paymentLink: pay.payUrl, total: existing.total };
    }
    const offer = await this.db.agentOffer.findFirst({
      where: { negotiationId, businessId, status: 'proposed', deletedAt: null }, orderBy: { createdAt: 'desc' },
    });
    if (!offer) throw new ConflictException('no agreed offer from this business');
    await this.agents.negotiator.confirm(offer.id).catch(() => undefined); // in-memory copy may be gone after restart
    await this.db.agentOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } });

    const rows = await this.db.catalogItem.findMany({ where: { businessId } });
    const products: Product[] = rows.map((p) => ({ id: p.id, businessId: p.businessId, name: p.name, price: p.price, unit: p.unit }));
    const items = parseJson<Offer['items']>(offer.items, []);
    // Upsell is priced from the catalog by code, at full price (discount applies to the negotiated offer only).
    const upsell = acceptUpsell ? parseJson<Offer['upsell'] | null>(offer.upsell, null) : null;
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
    const order = await this.db.order.create({
      data: {
        businessId, userId: neg.userId, negotiationId, offerId: offer.id, items: JSON.stringify(payload.items),
        total, discountPct: offer.discountPct, status: 'confirmed',
      },
    });
    const pay = await this.payments.createPaymentLink(order);
    await this.db.negotiation.update({ where: { id: negotiationId }, data: { status: 'confirmed' } });
    await this.emit(negotiationId, { type: 'status', status: 'confirmed' });
    return { orderId: order.id, paymentLink: pay.payUrl, total, upsellAccepted: withUpsell };
  }

  private async runAll(negId: string, userId: string, text: string): Promise<void> {
    const lang = detectLang(text);
    const memory = await this.agents.memory.factsFor(userId);
    const tasks = await this.agents.personalAgent.parse(text, memory.map((f) => `- ${f}`).join('\n'));
    const shared: NegotiationTask[] = tasks.map((t, i) => ({
      taskId: `${negId}:${i}`, category: t.category, need: t.need, when: t.when, where: t.area, people: t.people,
    }));
    await this.db.negotiation.update({ where: { id: negId }, data: { tasks: JSON.stringify(shared) } });
    this.logger.log(`${negId}: ${tasks.length} task(s) ${JSON.stringify(tasks)}`);
    if (tasks.length === 0) return this.fail(negId, "So'rovdan vazifa topilmadi (restoran, avtoservis, do'kon, klinika)");

    const results = (await Promise.all(tasks.map((task) => this.runTask(negId, userId, text, lang, task, memory)))).flat();
    const best = results.find((r) => r.status === 'agreed') ?? results[0];
    if (best) {
      // Memory once per request (not per lane): user text + the agreed dialogue.
      void this.agents.memory
        .extract({ userId, sessionId: best.sessionId, userText: text, transcript: best.transcript })
        .catch((e: unknown) => this.logger.warn(`memory ${negId}: ${errMsg(e)}`));
    }
    const status: NegotiationStatus = results.some((r) => r.status === 'agreed')
      ? 'agreed'
      : results.length === 0 ? 'failed' : 'rejected';
    await this.db.negotiation.update({ where: { id: negId }, data: { status } });
    await this.emit(negId, { type: 'status', status });
    this.close(negId);
  }

  /** One task: all matching businesses (cap 3) negotiate in parallel, then a deterministic winner is emitted. */
  private async runTask(
    negId: string, userId: string, text: string, lang: 'uz' | 'ru', task: UserTask, memory: string[],
  ): Promise<NegotiationResult[]> {
    const businesses = (await this.agents.personalAgent.findBusinesses(task)).slice(0, MAX_BUSINESSES_PER_TASK);
    if (businesses.length === 0) {
      await this.db.auditFinding.create({ data: { sessionId: negId, type: 'not_found', detail: `${task.category}: ${task.need}`, at: new Date() } });
      return [];
    }
    const results = (
      await Promise.all(businesses.map((b) => this.runLane(negId, userId, lang, task, b, memory, businesses.length - 1)))
    ).filter((r): r is NegotiationResult => r !== undefined);
    if (businesses.length > 1) await this.emitWinner(negId, lang, businesses, results, memory);
    return results;
  }

  private async emitWinner(
    negId: string, lang: 'uz' | 'ru', businesses: AgentBusiness[], results: NegotiationResult[], memory: string[],
  ): Promise<void> {
    const contenders: Contender[] = results.flatMap((r) => {
      const business = businesses.find((b) => b.id === r.businessId);
      return r.status === 'agreed' && r.offer && business ? [{ business, offer: r.offer }] : [];
    });
    const ranked = rankContenders(contenders);
    const w = ranked[0];
    if (!w) return;
    const products = await this.store.getProducts(w.business.id);
    await this.emit(negId, {
      type: 'best_offer', businessId: w.business.id, businessName: w.business.name, offer: toOfferPayload(w.offer, products),
      winner: true, reason: winnerReason(ranked, lang),
      ranking: ranked.map((r) => ({
        businessId: r.business.id, businessName: r.business.name, price: r.offer.total, discountPct: r.offer.discountPct,
        rating: r.rating, distanceKm: r.distanceKm, score: r.score,
      })),
      ...(memory.length ? { appliedMemory: memory } : {}),
    });
  }

  private async runLane(
    negId: string, userId: string, lang: 'uz' | 'ru', task: UserTask, business: AgentBusiness, memory: string[], competitors: number,
  ): Promise<NegotiationResult | undefined> {
    const products = await this.store.getProducts(business.id);
    const mapper = new LaneMapper(negId, business.id, products, (e) => void this.emit(negId, e), memory);
    try {
      const result = await this.agents.negotiator.run({
        sessionId: sessionIdOf(negId, business.id), userId, business, task, lang, memory, competitors,
        onEvent: (_sid, e) => mapper.handle(e),
      });
      mapper.finish(result.status);
      if (result.status === 'agreed' && result.offer) {
        await this.emit(negId, {
          type: 'best_offer', businessId: business.id, businessName: business.name, offer: toOfferPayload(result.offer, products),
          ...(memory.length ? { appliedMemory: memory } : {}),
        });
      }
      void this.postSession(result, products, business.maxDiscountPct);
      return result;
    } catch (e) {
      this.logger.error(`${negId}/${business.id}: ${errMsg(e)}`);
      await this.emit(negId, { type: 'error', error: `${business.name}: ${errMsg(e)}` });
      return undefined;
    }
  }

  /** Auditor after the session (best effort, never blocks the stream). Memory is extracted once per request in runAll. */
  private async postSession(r: NegotiationResult, products: Product[], maxDiscountPct: number) {
    await this.agents.auditor
      .review({ sessionId: r.sessionId, businessId: r.businessId, transcript: r.transcript, products, maxDiscountPct })
      .catch((e: unknown) => this.logger.warn(`post-session ${r.sessionId}: ${errMsg(e)}`));
  }

  private async fail(negId: string, error: string): Promise<void> {
    this.logger.error(`${negId}: ${error}`);
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
