import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';
import type {
  AgentRequestResult, ConfirmResult, NegotiationEvent, NegotiationStatus, NegotiationTask,
} from '@botir/shared';
import { detectLang, type AgentBusiness, type NegotiationResult, type Product, type UserTask } from '../agents';
import { errMsg, parseJson } from '../common/http';
import { PrismaAgentStore, sessionIdOf } from '../db/prisma-agent-store';
import { PrismaService } from '../db/prisma.service';
import { PAYMENT_LINK, type PaymentLinkProvider } from '../payments/payment-link';
import { AGENTS, type Agents } from './agents.provider';
import { LaneMapper, toOfferPayload } from './event-mapper';

const MAX_BUSINESSES_PER_TASK = 2;

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
  async confirm(negotiationId: string, businessId: string): Promise<ConfirmResult> {
    if (!businessId) throw new BadRequestException('businessId is required');
    const neg = await this.db.negotiation.findFirst({ where: { id: negotiationId, deletedAt: null } });
    if (!neg) throw new NotFoundException('negotiation not found');
    const existing = await this.db.order.findFirst({ where: { negotiationId, businessId, deletedAt: null } });
    if (existing) {
      const pay = await this.payments.createPaymentLink(existing);
      return { orderId: existing.id, paymentLink: pay.payUrl };
    }
    const offer = await this.db.agentOffer.findFirst({
      where: { negotiationId, businessId, status: 'proposed', deletedAt: null }, orderBy: { createdAt: 'desc' },
    });
    if (!offer) throw new ConflictException('no agreed offer from this business');
    await this.agents.negotiator.confirm(offer.id).catch(() => undefined); // in-memory copy may be gone after restart
    await this.db.agentOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } });

    const products = await this.db.catalogItem.findMany({ where: { businessId } });
    const payload = toOfferPayload(
      { id: offer.id, sessionId: offer.sessionId, items: parseJson(offer.items, []), total: offer.total, discountPct: offer.discountPct, status: 'accepted' },
      products.map((p) => ({ id: p.id, businessId: p.businessId, name: p.name, price: p.price, unit: p.unit })),
    );
    const order = await this.db.order.create({
      data: {
        businessId, userId: neg.userId, negotiationId, offerId: offer.id, items: JSON.stringify(payload.items),
        total: offer.total, discountPct: offer.discountPct, status: 'confirmed',
      },
    });
    const pay = await this.payments.createPaymentLink(order);
    await this.db.negotiation.update({ where: { id: negotiationId }, data: { status: 'confirmed' } });
    await this.emit(negotiationId, { type: 'status', status: 'confirmed' });
    return { orderId: order.id, paymentLink: pay.payUrl };
  }

  private async runAll(negId: string, userId: string, text: string): Promise<void> {
    const lang = detectLang(text);
    const tasks = await this.agents.personalAgent.parse(text, await this.agents.memory.contextFor(userId));
    const shared: NegotiationTask[] = tasks.map((t, i) => ({
      taskId: `${negId}:${i}`, category: t.category, need: t.need, when: t.when, where: t.area, people: t.people,
    }));
    await this.db.negotiation.update({ where: { id: negId }, data: { tasks: JSON.stringify(shared) } });
    this.logger.log(`${negId}: ${tasks.length} task(s) ${JSON.stringify(tasks)}`);
    if (tasks.length === 0) return this.fail(negId, "So'rovdan vazifa topilmadi (restoran, avtoservis, do'kon, klinika)");

    const lanes: Promise<NegotiationResult | undefined>[] = [];
    for (const task of tasks) {
      const businesses = (await this.agents.personalAgent.findBusinesses(task)).slice(0, MAX_BUSINESSES_PER_TASK);
      if (businesses.length === 0) {
        await this.db.auditFinding.create({ data: { sessionId: negId, type: 'not_found', detail: `${task.category}: ${task.need}`, at: new Date() } });
        continue;
      }
      for (const business of businesses) lanes.push(this.runLane(negId, userId, text, lang, task, business));
    }
    const results = (await Promise.all(lanes)).filter((r): r is NegotiationResult => r !== undefined);
    const status: NegotiationStatus = results.some((r) => r.status === 'agreed')
      ? 'agreed'
      : results.length === 0 ? 'failed' : 'rejected';
    await this.db.negotiation.update({ where: { id: negId }, data: { status } });
    await this.emit(negId, { type: 'status', status });
    this.close(negId);
  }

  private async runLane(
    negId: string, userId: string, text: string, lang: 'uz' | 'ru', task: UserTask, business: AgentBusiness,
  ): Promise<NegotiationResult | undefined> {
    const products = await this.store.getProducts(business.id);
    const mapper = new LaneMapper(negId, business.id, products, (e) => void this.emit(negId, e));
    try {
      const result = await this.agents.negotiator.run({
        sessionId: sessionIdOf(negId, business.id), userId, business, task, lang,
        onEvent: (_sid, e) => mapper.handle(e),
      });
      mapper.finish(result.status);
      if (result.status === 'agreed' && result.offer) {
        await this.emit(negId, { type: 'best_offer', businessId: business.id, businessName: business.name, offer: toOfferPayload(result.offer, products) });
      }
      void this.postSession(result, text, products, business.maxDiscountPct);
      return result;
    } catch (e) {
      this.logger.error(`${negId}/${business.id}: ${errMsg(e)}`);
      await this.emit(negId, { type: 'error', error: `${business.name}: ${errMsg(e)}` });
      return undefined;
    }
  }

  /** Auditor + memory after the session (best effort, never blocks the stream). */
  private async postSession(r: NegotiationResult, text: string, products: Product[], maxDiscountPct: number) {
    await Promise.all([
      this.agents.auditor.review({ sessionId: r.sessionId, businessId: r.businessId, transcript: r.transcript, products, maxDiscountPct }),
      this.agents.memory.extract({ userId: r.userId, sessionId: r.sessionId, userText: text, transcript: r.transcript }),
    ]).catch((e: unknown) => this.logger.warn(`post-session ${r.sessionId}: ${errMsg(e)}`));
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
