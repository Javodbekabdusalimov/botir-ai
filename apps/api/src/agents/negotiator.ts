import { randomUUID } from 'node:crypto';
import type { BusinessAgent, BusinessTurnResult, Lang } from './business-agent';
import type { PersonalAgent } from './personal-agent';
import type { AgentMessage, AgentRole, NegotiationEvent, NegotiationStatus, Offer } from './shared';
import type { AgentStore } from './store/agent-store';
import type { AgentLogger } from './logger';
import { silentLogger } from './logger';
import { MAX_ROUNDS } from './policy-guard';
import type { AgentBusiness, UserTask } from './types';

export type NegotiationEventHandler = (sessionId: string, event: NegotiationEvent) => void;

export interface NegotiationInput {
  userId: string;
  business: AgentBusiness;
  task: UserTask;
  lang: Lang;
  sessionId?: string; // pass your own (e.g. Prisma id) to stream SSE before start resolves
  onEvent?: NegotiationEventHandler;
  /** Every business-agent turn (metrics, unknown questions). Must not throw. */
  onTurn?: (turn: BusinessTurnResult) => void;
}

export interface NegotiationResult {
  sessionId: string;
  userId: string;
  businessId: string;
  status: Exclude<NegotiationStatus, 'running'>;
  offer?: Offer; // status 'proposed' — waits for human "Tasdiqlayman" (confirm)
  transcript: AgentMessage[];
  rounds: number;
}

/** A2A negotiation: REQUEST → OFFER → COUNTER → final OFFER/ACCEPT, max 3 rounds. Nothing is paid/booked here. */
export class Negotiator {
  private readonly offers = new Map<string, Offer>();

  constructor(
    private readonly deps: {
      store: AgentStore;
      businessAgent: BusinessAgent;
      personalAgent: PersonalAgent;
      logger?: AgentLogger;
    },
  ) {}

  async run(input: NegotiationInput): Promise<NegotiationResult> {
    const { store, businessAgent, personalAgent } = this.deps;
    const logger = this.deps.logger ?? silentLogger;
    const sessionId = input.sessionId ?? randomUUID();
    const emit = (e: NegotiationEvent): void => input.onEvent?.(sessionId, e);
    const transcript: AgentMessage[] = [];
    const say = async (role: AgentRole, text: string): Promise<void> => {
      const message: AgentMessage = { id: randomUUID(), role, text, at: new Date().toISOString() };
      transcript.push(message);
      await store.saveMessage(sessionId, message);
      emit({ type: 'message', message });
    };

    const products = await store.getProducts(input.business.id);
    let offer: Offer | undefined;
    let status: NegotiationResult['status'] = 'timeout';
    let round = 0;

    emit({ type: 'status', status: 'running' });
    try {
      await say('personal_agent', personalAgent.requestText(input.task, input.lang));
      for (round = 1; round <= MAX_ROUNDS; round++) {
        const turn = await businessAgent.respond({
          sessionId, business: input.business, products, history: transcript, round, lang: input.lang,
        });
        input.onTurn?.(turn);
        await say('biz_agent', turn.reply);
        for (const v of turn.violations) await say('system', `PolicyGuard: ${v}`);
        if (turn.offer) {
          offer = turn.offer;
          this.offers.set(offer.id, offer);
          await store.saveOffer(offer);
          emit({ type: 'offer', offer });
        }

        const decision = await personalAgent.decide({
          task: input.task, history: transcript, offer, round, maxRounds: MAX_ROUNDS, lang: input.lang,
        });
        await say('personal_agent', decision.message);
        if (decision.action === 'accept') {
          status = offer ? 'agreed' : 'rejected';
          break;
        }
        if (decision.action === 'reject') {
          status = 'rejected';
          break;
        }
      }
    } catch (e) {
      logger.error(`[negotiator] ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      await say('system', input.lang === 'ru' ? 'Техническая ошибка, переговоры остановлены.' : "Texnik xato, muzokara to'xtatildi.");
      status = 'timeout';
    }

    if (status === 'agreed') {
      await say('system', input.lang === 'ru' ? 'Предложение готово. Нажмите «Подтверждаю».' : "Taklif tayyor. \"Tasdiqlayman\" tugmasini bosing.");
    }
    emit({ type: 'status', status });
    return {
      sessionId, userId: input.userId, businessId: input.business.id, status,
      offer: status === 'agreed' ? offer : undefined, transcript, rounds: Math.min(round, MAX_ROUNDS),
    };
  }

  /** Human pressed "Tasdiqlayman". Only marks the offer accepted — order/payment link is created by Nest (incoming only). */
  async confirm(offerId: string): Promise<Offer> {
    return this.setStatus(offerId, 'accepted');
  }

  async decline(offerId: string): Promise<Offer> {
    return this.setStatus(offerId, 'declined');
  }

  private async setStatus(offerId: string, status: Offer['status']): Promise<Offer> {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error(`offer not found: ${offerId}`);
    if (offer.status !== 'proposed') throw new Error(`offer ${offerId} already ${offer.status}`);
    const next: Offer = { ...offer, status };
    this.offers.set(offerId, next);
    await this.deps.store.saveOffer(next);
    return next;
  }
}
