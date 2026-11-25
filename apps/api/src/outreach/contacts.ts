import type { OutreachChannel, OutreachHandoffKind } from '@botir/shared';

export interface ExternalContacts {
  telegramUser?: string;
  telegramBot?: string;
  telegramChannel?: string;
  instagram?: string;
  phone?: string;
  website?: string;
}

const TG_HANDLE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "@name", "name", "https://t.me/name", "t.me/name?start=x" → "name"; invalid → undefined. */
export function tgHandle(v: unknown): string | undefined {
  const h = str(v).replace(/^https?:\/\/(www\.)?(t|telegram)\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0] ?? '';
  return TG_HANDLE.test(h) ? h : undefined;
}

export function igHandle(v: unknown): string | undefined {
  const h = str(v).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0] ?? '';
  return IG_HANDLE.test(h) ? h : undefined;
}

/** Uzbek numbers → "+998XXXXXXXXX"; other plausible international numbers keep their digits. */
export function phoneOf(v: unknown): string | undefined {
  const d = str(v).replace(/\D/g, '');
  if (d.length === 9) return `+998${d}`;
  return d.length >= 11 && d.length <= 15 ? `+${d}` : undefined;
}

export function websiteOf(v: unknown): string | undefined {
  const s = str(v);
  if (!s || /\s/.test(s)) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps only valid, canonical values. Nothing is guessed: a bad value is dropped, a missing one stays missing. */
export function normalizeContacts(raw: unknown): ExternalContacts {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: ExternalContacts = {
    telegramUser: tgHandle(r.telegramUser),
    telegramBot: tgHandle(r.telegramBot),
    telegramChannel: tgHandle(r.telegramChannel),
    instagram: igHandle(r.instagram),
    phone: phoneOf(r.phone),
    website: websiteOf(r.website),
  };
  for (const k of Object.keys(out) as (keyof ExternalContacts)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export interface ChannelChoice {
  channel: OutreachChannel;
  handoffKind?: OutreachHandoffKind;
  /** Deep link the user (or the agent's handoff card) opens. */
  link?: string;
}

/**
 * The contact chain, first match wins: personal Telegram → Telegram bot → channel → Instagram → phone → website → none.
 * Phone sits below Telegram/Instagram on purpose: phones come from bios and directories, messengers are the real inbox.
 */
export function pickChannel(c: ExternalContacts): ChannelChoice {
  if (c.telegramUser) return { channel: 'telegram_user', link: `https://t.me/${c.telegramUser}` };
  if (c.telegramBot) return { channel: 'telegram_bot', link: `https://t.me/${c.telegramBot}?start=lifeassistant` };
  if (c.telegramChannel) return { channel: 'handoff', handoffKind: 'telegram_channel', link: `https://t.me/${c.telegramChannel}` };
  if (c.instagram) return { channel: 'handoff', handoffKind: 'instagram', link: `https://ig.me/m/${c.instagram}` };
  if (c.phone) return { channel: 'handoff', handoffKind: 'phone', link: `tel:${c.phone}` };
  if (c.website) return { channel: 'handoff', handoffKind: 'website', link: c.website };
  return { channel: 'none' };
}

/** Telegram username the agent writes to (user or bot channel only). */
export const telegramTarget = (c: ExternalContacts, channel: OutreachChannel): string | undefined =>
  channel === 'telegram_user' ? c.telegramUser : channel === 'telegram_bot' ? c.telegramBot : undefined;

export const DISCLOSURE = 'Life Assistant yordamchisi orqali yozilmoqda';

/** Deterministic Uzbek message (no LLM): the handoff card text and the fallback of the LLM draft. */
export function templateMessage(need: string, businessName: string, extra?: { when?: string; people?: number }): string {
  const details = [need, extra?.when, extra?.people ? `${extra.people} kishi` : undefined].filter(Boolean).join(', ');
  return `Assalomu alaykum! ${businessName} uchun so'rov: ${details}. Narx va band vaqtlarini aytib bera olasizmi? (${DISCLOSURE}.)`;
}

/** The disclosure is a hard requirement: add it when the LLM text lacks it. */
export const withDisclosure = (text: string): string =>
  text.toLowerCase().includes('life assistant') ? text : `${text.trim()} (${DISCLOSURE}.)`;
