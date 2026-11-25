import { createLogger, errMsg } from './logger';
import { messageKey, type Chat, type TgMessage, type TgStore } from './types';

// PolicyGuard for outgoing Telegram messages (ARCHITECTURE.md §13):
// no first message to unknown peers, no bulk, rate limit, autopilot only in business hours.

const log = createLogger('tg-sender');

export type SendBy = 'owner' | 'ai';
export type SendResult = { ok: true; message: TgMessage } | { ok: false; reason: string };

/** Delivers text to a peer; returns Telegram message id. Userbot → TgSync.sendRaw, Business → bot API. */
export type Transport = (chat: Chat, text: string) => Promise<{ tgMsgId: number }>;

export interface BusinessHours {
  from: string; // "09:00"
  to: string; // "21:00" (may be < from for overnight shifts)
  timeZone?: string; // default Asia/Tashkent
}

export interface SendOptions {
  hours?: BusinessHours;
  now?: Date;
  /**
   * The ONE exception to "no first message to unknown peers" (outreach): set only for an approved UserAction flagged
   * firstContact. `sentToday` = the user's other approved first contacts in the last 24 h.
   */
  firstContact?: { sentToday: number };
}

export const FIRST_CONTACT_PER_DAY = 5;
const FLOOD_DEFAULT_S = 3600;

/** Seconds to wait if the error is Telegram FLOOD_WAIT (gramjs: "A wait of N seconds is required"), else undefined. */
const floodSeconds = (e: unknown): number | undefined => {
  const m = /FLOOD_WAIT_?(\d+)|wait of (\d+) seconds/i.exec(errMsg(e));
  return m ? Number(m[1] ?? m[2]) : /FLOOD/i.test(errMsg(e)) ? FLOOD_DEFAULT_S : undefined;
};

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_LEN = 4096;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function isWithinHours(hours: BusinessHours, now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: hours.timeZone ?? 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const cur = get('hour') * 60 + get('minute');
  const from = toMinutes(hours.from);
  const to = toMinutes(hours.to);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

export class Sender {
  private readonly sentAt = new Map<string, number[]>(); // accountId → timestamps
  private readonly floodUntil = new Map<string, number>(); // accountId → ms; blocks first contacts only

  constructor(
    private readonly store: TgStore,
    private readonly transport: Transport,
  ) {}

  async send(accountId: string, chatId: string, text: string, by: SendBy, opts: SendOptions = {}): Promise<SendResult> {
    if (typeof chatId !== 'string' || chatId.includes(',')) return this.deny('bulk send is not allowed (one chat per call)');
    const body = text.trim();
    if (!body) return this.deny('empty text');
    if (body.length > MAX_LEN) return this.deny(`text longer than ${MAX_LEN} chars`);

    const chat = await this.store.getChat(chatId);
    if (!chat || chat.accountId !== accountId) return this.deny('unknown chat (first message to a new peer is not allowed)');
    const history = await this.store.listMessages(chatId);
    if (!history.some((m) => m.direction === 'in')) {
      if (!opts.firstContact) return this.deny('peer never wrote to us (no first message to unknown peers)');
      const why = this.firstContactDenial(accountId, chat.mode, by, history, opts);
      if (why) return this.deny(why);
    }

    if (by === 'ai') {
      if (chat.mode !== 'autopilot') return this.deny(`AI may send only in autopilot mode (chat is ${chat.mode})`);
      if (!opts.hours) return this.deny('autopilot needs business hours');
      if (!isWithinHours(opts.hours, opts.now)) return this.deny('outside business hours');
    }

    const now = (opts.now ?? new Date()).getTime();
    const recent = (this.sentAt.get(accountId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return this.deny(`rate limit ${RATE_LIMIT}/min reached`);
    // Take the slot before awaiting the transport: parallel sends must not all pass the check above.
    recent.push(now);
    this.sentAt.set(accountId, recent);

    let tgMsgId: number;
    try {
      ({ tgMsgId } = await this.transport(chat, body));
    } catch (e) {
      log.error(`transport failed for ${chatId}: ${errMsg(e)}`);
      const flood = floodSeconds(e);
      if (flood !== undefined) this.floodUntil.set(accountId, now + flood * 1000); // stop writing to new peers
      const slots = this.sentAt.get(accountId) ?? [];
      const i = slots.indexOf(now);
      if (i >= 0) slots.splice(i, 1); // a failed send does not count
      return { ok: false, reason: 'telegram send failed' };
    }

    const message: TgMessage = {
      id: messageKey(chatId, tgMsgId),
      chatId,
      tgMsgId,
      direction: 'out',
      author: by,
      text: body,
      sentAt: new Date(now).toISOString(),
    };
    await this.store.saveMessage(message);
    await this.store.upsertChat({ ...chat, draft: undefined, needsHuman: false });
    return { ok: true, message };
  }

  /** Why a first contact is refused; undefined = allowed. Owner-approved only, never autopilot, new peers only, capped, stops on FLOOD_WAIT. */
  private firstContactDenial(accountId: string, mode: string, by: SendBy, history: TgMessage[], opts: SendOptions): string | undefined {
    if (by !== 'owner' || mode === 'autopilot') return 'first contact needs the owner approval, never autopilot';
    if (history.length > 0) return 'already wrote to this peer: wait for a reply';
    if ((opts.firstContact?.sentToday ?? FIRST_CONTACT_PER_DAY) >= FIRST_CONTACT_PER_DAY) return `first-contact limit ${FIRST_CONTACT_PER_DAY} new peers/day reached`;
    if ((this.floodUntil.get(accountId) ?? 0) > (opts.now ?? new Date()).getTime()) return 'Telegram FLOOD_WAIT: first contacts are paused';
    return undefined;
  }

  private deny(reason: string): SendResult {
    log.warn(`blocked: ${reason}`);
    return { ok: false, reason };
  }
}
