import { Inject, Injectable, Logger } from '@nestjs/common';
import { errMsg } from '../common/http';
import { PrismaService } from '../db/prisma.service';
import { normalizeQuestion, QuestionsService } from './questions.service';

export type TurnChannel = 'negotiation' | 'inbox';

export interface RecordedTurn {
  confidence: number;
  unknownQuestion?: string;
  needsHuman?: boolean;
}

const MIN_CONFIDENCE = 0.5;

const includesAll = (all: Set<string>, some: Set<string>): boolean => [...some].every((w) => all.has(w));

/** Real customer turns only (the evaluator never calls this). Best effort: no method throws. */
@Injectable()
export class TurnRecorder {
  private readonly logger = new Logger('AgentTurns');

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(QuestionsService) private readonly questions: QuestionsService,
  ) {}

  /** Recorder for one conversation: the same question, even reworded longer in later rounds, counts once. */
  session(businessId: string, channel: TurnChannel): (turn: RecordedTurn) => void {
    const asked: Set<string>[] = [];
    return (turn) => {
      const words = turn.unknownQuestion ? new Set(normalizeQuestion(turn.unknownQuestion).split(' ')) : null;
      const repeated = words !== null && asked.some((prev) => includesAll(prev, words) || includesAll(words, prev));
      if (words) asked.push(words);
      void this.record(businessId, channel, turn, !repeated);
    };
  }

  async record(businessId: string, channel: TurnChannel, turn: RecordedTurn, recordQuestion = true): Promise<void> {
    const answered = !turn.unknownQuestion && !turn.needsHuman && turn.confidence >= MIN_CONFIDENCE;
    try {
      await this.db.agentTurn.create({ data: { businessId, channel, answered } });
      if (turn.unknownQuestion && recordQuestion) await this.questions.record(businessId, turn.unknownQuestion);
    } catch (e) {
      this.logger.warn(`${channel} ${businessId}: ${errMsg(e)}`);
    }
  }
}
