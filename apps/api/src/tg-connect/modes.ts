import { createLogger, errMsg } from './logger';
import type { BusinessHours, Sender } from './sender';
import type { Chat, ChatMode, TgMessage, TgStore } from './types';

// Chat modes: copilot (draft for owner) · command (owner drives via bot) · autopilot · off.

const log = createLogger('tg-modes');
export const AUTOPILOT_MIN_CONFIDENCE = 0.7;
const HISTORY_FOR_AGENT = 20;

export interface DraftReply {
  text: string;
  confidence: number;
  needsHuman: boolean;
}

/** Provided by the agent layer (apps/api/src/agents). */
export type DraftReplyFn = (chat: Chat, history: TgMessage[]) => Promise<DraftReply>;

export type IncomingOutcome =
  | { action: 'ignored'; mode: ChatMode }
  | { action: 'drafted'; draft: DraftReply }
  | { action: 'sent'; draft: DraftReply }
  | { action: 'needs_human'; draft?: DraftReply; reason: string };

export class ModeHandler {
  constructor(
    private readonly store: TgStore,
    private readonly sender: Sender,
    private readonly draftReply: DraftReplyFn,
    /** Today's business hours for autopilot (per account); undefined = closed / unknown → never auto-sends. */
    private readonly hoursFor: (accountId: string) => BusinessHours | undefined | Promise<BusinessHours | undefined>,
  ) {}

  setMode(chatId: string, mode: ChatMode): Promise<Chat | undefined> {
    return this.store.setChatMode(chatId, mode);
  }

  async handleIncoming(chat: Chat, msg: TgMessage): Promise<IncomingOutcome> {
    const current = (await this.store.getChat(chat.id)) ?? chat;
    if (msg.direction !== 'in' || current.mode === 'off' || current.mode === 'command') {
      return { action: 'ignored', mode: current.mode };
    }

    let draft: DraftReply;
    try {
      draft = await this.draftReply(current, await this.store.listMessages(current.id, HISTORY_FOR_AGENT));
    } catch (e) {
      log.error(`draftReply failed for ${current.id}: ${errMsg(e)}`);
      await this.store.upsertChat({ ...current, needsHuman: true });
      return { action: 'needs_human', reason: 'agent error' };
    }
    const saveDraft = (needsHuman: boolean) =>
      this.store.upsertChat({ ...current, needsHuman, draft: { ...draft, createdAt: new Date().toISOString() } });

    if (current.mode === 'copilot') {
      await saveDraft(draft.needsHuman);
      return { action: 'drafted', draft };
    }

    // autopilot
    if (draft.needsHuman || draft.confidence < AUTOPILOT_MIN_CONFIDENCE) {
      await saveDraft(true);
      return { action: 'needs_human', draft, reason: draft.needsHuman ? 'agent asked for human' : 'low confidence' };
    }
    const res = await this.sender.send(current.accountId, current.id, draft.text, 'ai', {
      hours: await this.hoursFor(current.accountId),
    });
    if (res.ok) return { action: 'sent', draft };
    await saveDraft(true);
    return { action: 'needs_human', draft, reason: res.reason };
  }
}
