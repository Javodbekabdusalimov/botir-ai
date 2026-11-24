import type { SendResult } from './sender';

// Permission gate: the AI may write from the user's Telegram only after an explicit approve
// ("ha" in Saved Messages or the site button). propose() never sends.

export type ActionStatus = 'pending' | 'sending' | 'sent' | 'rejected' | 'failed';

export interface TgAction {
  id: string;
  userId: string;
  accountId: string;
  chatId: string;
  peerTitle: string;
  text: string;
  status: ActionStatus;
  reason?: string;
  createdAt: string; // ISO
}

export type NewTgAction = Pick<TgAction, 'userId' | 'accountId' | 'chatId' | 'peerTitle' | 'text'>;

export interface ActionStore {
  create(a: NewTgAction): Promise<TgAction>;
  get(id: string): Promise<TgAction | undefined>;
  /** Newest first. */
  listPending(userId: string): Promise<TgAction[]>;
  /** Atomically pending → sending. false = someone else already decided. */
  claim(id: string): Promise<boolean>;
  finish(id: string, status: 'sent' | 'rejected' | 'failed', reason?: string): Promise<void>;
}

/** Guarded send (PolicyGuard Sender, by 'owner' since the user approved it). */
export type ActionSend = (accountId: string, chatId: string, text: string) => Promise<SendResult>;

export type Decision = { ok: true; action: TgAction } | { ok: false; reason: string };

export class ActionGate {
  constructor(
    private readonly store: ActionStore,
    private readonly send: ActionSend,
  ) {}

  propose(input: NewTgAction): Promise<TgAction> {
    return this.store.create({ ...input, text: input.text.trim() });
  }

  async approve(userId: string, id: string): Promise<Decision> {
    const claimed = await this.claim(userId, id);
    if (!claimed.ok) return claimed;
    const a = claimed.action;
    const res = await this.send(a.accountId, a.chatId, a.text);
    if (!res.ok) {
      await this.store.finish(id, 'failed', res.reason);
      return { ok: false, reason: res.reason };
    }
    await this.store.finish(id, 'sent');
    return { ok: true, action: { ...a, status: 'sent' } };
  }

  async reject(userId: string, id: string): Promise<Decision> {
    const claimed = await this.claim(userId, id);
    if (!claimed.ok) return claimed;
    await this.store.finish(id, 'rejected');
    return { ok: true, action: { ...claimed.action, status: 'rejected' } };
  }

  private async claim(userId: string, id: string): Promise<Decision> {
    const a = await this.store.get(id);
    if (!a || a.userId !== userId) return { ok: false, reason: 'action not found' };
    if (a.status !== 'pending' || !(await this.store.claim(id))) return { ok: false, reason: `action is already ${a.status}` };
    return { ok: true, action: a };
  }
}
