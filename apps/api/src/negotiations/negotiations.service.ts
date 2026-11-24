import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Negotiation } from '@prisma/client';
import { Observable, ReplaySubject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import {
  AGENTS_BRIDGE,
  type A2APayload,
  type AgentTurn,
  type AgentsBridge,
  type NegotiationTask,
} from './agents-bridge';

export type NegotiationEvent =
  | { type: 'message'; message: Record<string, unknown> }
  | {
      type: 'best_offer';
      businessId: string;
      businessName: string;
      offer: Extract<A2APayload, { type: 'OFFER' }>;
    }
  | { type: 'status'; status: string }
  | { type: 'error'; error: string };

interface BestOffer {
  businessId: string;
  businessName: string;
  offer: Extract<A2APayload, { type: 'OFFER' }>;
}

const MAX_BUSINESSES_PER_TASK = 3;
const STREAM_BUFFER = 200;
const TURN_DELAY_MS = 450;

@Injectable()
export class NegotiationsService {
  private readonly logger = new Logger(NegotiationsService.name);
  private readonly streams = new Map<string, ReplaySubject<NegotiationEvent>>();
  private readonly bestOffers = new Map<string, BestOffer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(AGENTS_BRIDGE) private readonly agents: AgentsBridge,
  ) {}

  async createRequest(
    userId: string,
    text: string,
  ): Promise<{ negotiationId: string; tasks: NegotiationTask[] }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isDeleted: false } });
    if (!user) throw new NotFoundException('user not found');

    const tasks = await this.agents.parseTasks(text);
    const negotiation = await this.prisma.negotiation.create({
      data: { userId, tasks, status: tasks.length > 0 ? 'running' : 'failed' },
    });

    const stream = new ReplaySubject<NegotiationEvent>(STREAM_BUFFER);
    this.streams.set(negotiation.id, stream);

    if (tasks.length === 0) {
      stream.next({ type: 'error', error: 'so‘rovdan vazifa aniqlanmadi' });
      stream.next({ type: 'status', status: 'failed' });
      stream.complete();
      return { negotiationId: negotiation.id, tasks };
    }

    // Deliberately not awaited: the caller gets the id immediately and watches SSE.
    void this.run(negotiation.id, tasks, stream);

    return { negotiationId: negotiation.id, tasks };
  }

  stream(negotiationId: string): Observable<NegotiationEvent> {
    const existing = this.streams.get(negotiationId);
    if (existing) return existing.asObservable();

    // A reconnect after the run finished: replay what was stored.
    const replay = new ReplaySubject<NegotiationEvent>(STREAM_BUFFER);
    void this.replayFromDb(negotiationId, replay);
    return replay.asObservable();
  }

  async confirm(negotiationId: string): Promise<{ orderId: string; paymentLink: string }> {
    const negotiation = await this.prisma.negotiation.findFirst({
      where: { id: negotiationId, isDeleted: false },
    });
    if (!negotiation) throw new NotFoundException('negotiation not found');

    const best = this.bestOffers.get(negotiationId) ?? (await this.bestOfferFromDb(negotiationId));
    if (!best) throw new NotFoundException('no offer to confirm');

    const order = await this.prisma.order.create({
      data: {
        businessId: best.businessId,
        userId: negotiation.userId,
        items: best.offer.items,
        total: best.offer.price,
        discountPct: best.offer.discountPct,
        status: 'confirmed',
      },
    });

    const payment = await this.payments.createBill(order.id, best.offer.price);

    await this.prisma.negotiation.update({
      where: { id: negotiationId },
      data: { status: 'confirmed' },
    });
    this.emit(negotiationId, { type: 'status', status: 'confirmed' });

    return { orderId: order.id, paymentLink: payment.link };
  }

  private async run(
    negotiationId: string,
    tasks: NegotiationTask[],
    stream: ReplaySubject<NegotiationEvent>,
  ): Promise<void> {
    try {
      for (const task of tasks) {
        const businesses = await this.prisma.business.findMany({
          where: {
            isDeleted: false,
            category: task.category,
            ...(task.where
              ? { district: { contains: task.where, mode: 'insensitive' as const } }
              : {}),
          },
          take: MAX_BUSINESSES_PER_TASK,
        });

        if (businesses.length === 0) {
          stream.next({ type: 'error', error: `${task.category}: mos biznes topilmadi` });
          continue;
        }

        for (const business of businesses) {
          for await (const turn of this.agents.negotiate(task, business.id)) {
            const saved = await this.persist(negotiationId, turn);
            stream.next({ type: 'message', message: saved });

            if (turn.payload.type === 'OFFER') {
              this.trackBest(negotiationId, business.id, business.name, turn.payload, stream);
            }
            await this.pause();
          }
        }
      }

      const agreed = this.bestOffers.has(negotiationId);
      await this.prisma.negotiation.update({
        where: { id: negotiationId },
        data: { status: agreed ? 'agreed' : 'rejected' },
      });
      stream.next({ type: 'status', status: agreed ? 'agreed' : 'rejected' });
    } catch (error) {
      this.logger.error(`negotiation ${negotiationId} failed: ${(error as Error).message}`);
      stream.next({ type: 'error', error: 'negotiation failed' });
      await this.prisma.negotiation
        .update({ where: { id: negotiationId }, data: { status: 'failed' } })
        .catch(() => undefined);
    } finally {
      stream.complete();
    }
  }

  private trackBest(
    negotiationId: string,
    businessId: string,
    businessName: string,
    offer: Extract<A2APayload, { type: 'OFFER' }>,
    stream: ReplaySubject<NegotiationEvent>,
  ): void {
    const current = this.bestOffers.get(negotiationId);
    if (current && current.offer.price <= offer.price) return;

    this.bestOffers.set(negotiationId, { businessId, businessName, offer });
    stream.next({ type: 'best_offer', businessId, businessName, offer });
  }

  private async persist(negotiationId: string, turn: AgentTurn): Promise<Record<string, unknown>> {
    const row = await this.prisma.negotiationMessage.create({
      data: {
        negotiationId,
        fromAgent: turn.fromAgent,
        businessId: turn.businessId,
        round: turn.round,
        text: turn.text,
        type: turn.payload.type,
        payload: turn.payload,
      },
    });

    return {
      id: row.id,
      negotiationId: row.negotiationId,
      fromAgent: row.fromAgent,
      businessId: row.businessId,
      round: row.round,
      text: row.text,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async replayFromDb(
    negotiationId: string,
    subject: ReplaySubject<NegotiationEvent>,
  ): Promise<void> {
    const negotiation = await this.prisma.negotiation.findFirst({
      where: { id: negotiationId, isDeleted: false },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!negotiation) {
      subject.next({ type: 'error', error: 'negotiation not found' });
      subject.complete();
      return;
    }

    for (const message of negotiation.messages) {
      subject.next({
        type: 'message',
        message: {
          id: message.id,
          negotiationId: message.negotiationId,
          fromAgent: message.fromAgent,
          businessId: message.businessId,
          round: message.round,
          text: message.text,
          payload: message.payload,
          createdAt: message.createdAt.toISOString(),
        },
      });
    }

    subject.next({ type: 'status', status: negotiation.status });
    subject.complete();
  }

  private async bestOfferFromDb(negotiationId: string): Promise<BestOffer | undefined> {
    const offers = await this.prisma.negotiationMessage.findMany({
      where: { negotiationId, type: 'OFFER', isDeleted: false },
      include: { business: true },
      orderBy: { createdAt: 'asc' },
    });

    let best: BestOffer | undefined;
    for (const row of offers) {
      const offer = row.payload as unknown as Extract<A2APayload, { type: 'OFFER' }>;
      if (!offer || typeof offer.price !== 'number') continue;
      if (!best || offer.price < best.offer.price) {
        best = { businessId: row.businessId, businessName: row.business.name, offer };
      }
    }
    return best;
  }

  private emit(negotiationId: string, event: NegotiationEvent): void {
    this.streams.get(negotiationId)?.next(event);
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, TURN_DELAY_MS));
  }
}
