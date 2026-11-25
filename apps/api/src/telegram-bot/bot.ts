import { execFile } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';
import type { Message } from 'grammy/types';
import { createLogger, errMsg } from '../tg-connect/logger';
import type { Sender, Transport } from '../tg-connect/sender';
import type { OnIncoming, TgSync } from '../tg-connect/sync';
import { chatKey, messageKey, type TgMessage, type TgStore } from '../tg-connect/types';

// Botir Telegram bot (grammY): personal agent, voice, command mode, Telegram Business (mode A), offer buttons.

const log = createLogger('tg-bot');
const run = promisify(execFile);

export interface BotDeps {
  token?: string;
  store: TgStore;
  sender: Sender;
  /** Personal agent reply for a plain text/voice message. `profile` = the Telegram sender (for the shared account). */
  personalAgent(userId: number, text: string, profile?: { first_name?: string; last_name?: string }): Promise<BotReply>;
  /** Public web origin (https) for Mini App buttons. Without an https URL the bot sends plain text links only. */
  webUrl?: string;
  /** Voice → text. Default: `bash ~/.claude/scripts/stt.sh <file>`. */
  transcribe?(filePath: string): Promise<string>;
  /** Command mode: "Aliga yoz: ..." → which chat of this owner. null = not found / not allowed. */
  resolveContact(ownerTgId: number, name: string): Promise<{ accountId: string; chatId: string } | null>;
  /** Offer buttons. */
  confirmOffer(offerId: string, userId: number): Promise<string>;
  /** Owner's reply to the bot's "agent does not know" message. null = not such a reply, handle as a normal message. */
  answerQuestion?(chatId: number, replyToMessageId: number, text: string): Promise<string | null>;
  alternativeOffer?(offerId: string, userId: number): Promise<string>;
  /** Same pipeline as userbot incoming (ModeHandler.handleIncoming). */
  onIncoming: OnIncoming;
}

export type CreateBotResult = { bot: Bot; reason?: undefined } | { bot: null; reason: string };

/** A bot reply; `webApp.path` is an internal web path ("/live/<id>") opened inside the Mini App. */
export type BotReply = string | { text: string; webApp?: { label: string; path: string } };

/** Telegram accepts web_app buttons only for https URLs. */
export const miniAppOrigin = (webUrl: string | undefined): string | null => {
  const u = (webUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/\s]+$/i.test(u) ? u : null;
};

/** `${WEB_URL}/tg?to=<internal path>` — only internal paths, never an external redirect. */
export function miniAppUrl(origin: string, path = ''): string {
  if (!path) return `${origin}/tg`;
  if (!/^\/(?!\/)[A-Za-z0-9/_\-.?=&%]*$/.test(path)) throw new Error(`not an internal path: ${path}`);
  return `${origin}/tg?to=${encodeURIComponent(path)}`;
}

/** Text + optional web_app keyboard. Without an https origin the internal path is appended as a plain link. */
export function renderReply(reply: BotReply, webUrl: string | undefined): { text: string; reply_markup?: InlineKeyboard } {
  if (typeof reply === 'string') return { text: reply };
  const { text, webApp } = reply;
  if (!webApp) return { text };
  const origin = miniAppOrigin(webUrl);
  if (!origin) return { text: `${text}\n${(webUrl ?? '').replace(/\/+$/, '')}${webApp.path}` };
  return { text, reply_markup: new InlineKeyboard().webApp(webApp.label, miniAppUrl(origin, webApp.path)) };
}

const OPEN_APP_LABEL = 'Life Assistant ochish';

/** Chat menu button → Mini App. No-op without an https origin; failure is logged, never fatal. */
export async function setupMenuButton(bot: Bot, webUrl: string | undefined): Promise<void> {
  const origin = miniAppOrigin(webUrl);
  if (!origin) return void log.warn('WEB_URL is not https — Mini App menu button skipped');
  await bot.api
    .setChatMenuButton({ menu_button: { type: 'web_app', text: 'Life Assistant', web_app: { url: miniAppUrl(origin) } } })
    .catch((e: unknown) => log.warn(`setChatMenuButton failed: ${errMsg(e)}`));
}

const GREETING =
  'Assalomu alaykum! Men Life Assistant — sizning AI yordamchingiz. 🤝\n\n' +
  "Menga oddiy so'z bilan yozing yoki ovozli xabar yuboring: nima kerakligini aytsangiz, " +
  "do'konlar, restoranlar va ustalar agentlari bilan o'zim gaplashib, eng yaxshi taklifni topib beraman.\n\n" +
  'Biznesingiz bormi? Telegram Business orqali meni ulang — mijozlaringizga javob qoralamalarini tayyorlayman.';

const COMMAND_RE = /^\s*(\S+?)(?:ga|ka|qa)\s+yoz\s*:\s*([\s\S]+)$/i;

export async function defaultTranscribe(filePath: string): Promise<string> {
  const script = join(homedir(), '.claude/scripts/stt.sh');
  const { stdout } = await run('bash', [script, filePath], { timeout: 180_000, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export function offerKeyboard(offerId: string): InlineKeyboard {
  return new InlineKeyboard().text('✅ Tasdiqlayman', `offer:ok:${offerId}`).text('🔄 Boshqasi', `offer:alt:${offerId}`);
}

export function createBot(deps: BotDeps): CreateBotResult {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    const reason = 'TELEGRAM_BOT_TOKEN is not set — Telegram bot disabled';
    log.warn(reason);
    return { bot: null, reason };
  }
  const bot = new Bot(token);
  const transcribe = deps.transcribe ?? defaultTranscribe;

  const send = (ctx: Context, reply: BotReply) => {
    const { text, reply_markup } = renderReply(reply, deps.webUrl);
    return ctx.reply(text, reply_markup ? { reply_markup } : undefined);
  };

  bot.command('start', (ctx) => send(ctx, { text: GREETING, webApp: { label: OPEN_APP_LABEL, path: '' } }));

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    const repliedTo = ctx.message.reply_to_message;
    if (repliedTo && deps.answerQuestion) {
      const saved = await deps.answerQuestion(ctx.chat.id, repliedTo.message_id, text);
      if (saved !== null) return void (await ctx.reply(saved));
    }
    const cmd = COMMAND_RE.exec(text);
    if (cmd) return handleCommand(ctx, deps, cmd[1] ?? '', cmd[2] ?? '');
    await ctx.replyWithChatAction('typing');
    await send(ctx, await deps.personalAgent(ctx.from.id, text, ctx.from));
  });

  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const file = await ctx.getFile();
    if (!file.file_path) return ctx.reply("Ovozli xabarni yuklab bo'lmadi.");
    const local = join(tmpdir(), `botir-voice-${ctx.from.id}-${Date.now()}.oga`);
    try {
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
      const text = await transcribe(local);
      if (!text) return ctx.reply('Ovozni tushunolmadim, qaytadan yuboring.');
      const cmd = COMMAND_RE.exec(text);
      if (cmd) return handleCommand(ctx, deps, cmd[1] ?? '', cmd[2] ?? '');
      await send(ctx, await deps.personalAgent(ctx.from.id, text, ctx.from));
    } catch (e) {
      log.error(`voice failed: ${errMsg(e)}`);
      await ctx.reply("Ovozni qayta ishlashda xato bo'ldi, matn bilan yozib ko'ring.");
    } finally {
      await unlink(local).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^offer:(ok|alt):(.+)$/, async (ctx) => {
    const [, kind, offerId] = ctx.match;
    await ctx.answerCallbackQuery();
    if (!offerId) return;
    const reply =
      kind === 'ok'
        ? await deps.confirmOffer(offerId, ctx.from.id)
        : deps.alternativeOffer
          ? await deps.alternativeOffer(offerId, ctx.from.id)
          : 'Boshqa variant qidiryapman…';
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(reply);
  });

  // ---- Telegram Business (mode A) ----
  bot.on('business_connection', async (ctx) => {
    const c = ctx.businessConnection;
    const id = `biz:${c.id}`;
    if (!c.is_enabled) {
      const acc = await deps.store.getAccount(id);
      if (acc) await deps.store.saveAccount({ ...acc, deletedAt: new Date().toISOString() });
      log.info(`business connection disabled: ${id}`);
      return;
    }
    await deps.store.saveAccount({
      id,
      kind: 'business',
      tgUserId: String(c.user.id),
      username: c.user.username,
      businessConnectionId: c.id,
      connectedAt: new Date(c.date * 1000).toISOString(),
    });
    log.info(`business connected: ${id}`);
  });

  bot.on('business_message', async (ctx) => {
    const m = ctx.businessMessage;
    const connId = m.business_connection_id;
    if (!connId || !m.text) return;
    const accountId = `biz:${connId}`;
    const account = await deps.store.getAccount(accountId);
    if (!account) return;
    const fromOwner = String(m.from?.id) === account.tgUserId;
    const peerId = String(m.chat.id);
    const id = chatKey(accountId, peerId);
    const chat =
      (await deps.store.getChat(id)) ??
      (await deps.store.upsertChat({
        id,
        accountId,
        peerId,
        title: [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ') || peerId,
        username: m.chat.username,
        mode: 'copilot',
        needsHuman: false,
      }));
    const msg = toBizMessage(id, m, fromOwner);
    await deps.store.saveMessage(msg);
    if (!fromOwner) await deps.onIncoming(chat, msg);
  });

  bot.catch((err) => log.error(`update ${err.ctx.update.update_id} failed: ${errMsg(err.error)}`));
  return { bot };
}

/**
 * Long polling with the update types we need (business updates included explicitly).
 * A bot failure must never take the API down: a bad token (401) switches the bot off, anything else (e.g. 409 = a
 * second instance polls the same token during a deploy) retries later.
 */
export function startBot(bot: Bot, retryMs = 60_000): void {
  bot
    .start({
      allowed_updates: ['message', 'callback_query', 'business_connection', 'business_message'],
      onStart: (me) => log.info(`bot @${me.username} started`),
    })
    .catch((e: unknown) => {
      if (e instanceof GrammyError && (e.error_code === 401 || e.error_code === 404)) {
        log.error(`bot disabled (check TELEGRAM_BOT_TOKEN): ${errMsg(e)}`);
        return;
      }
      log.error(`bot stopped: ${errMsg(e)}; retry in ${Math.round(retryMs / 1000)} s`);
      setTimeout(() => startBot(bot, retryMs), retryMs).unref();
    });
}

/** Transport for Sender: Business chats via Bot API, userbot chats via gramjs. */
export function makeTransport(store: TgStore, getBot: () => Bot | null, sync: TgSync): Transport {
  return async (chat, text) => {
    if (!chat.accountId.startsWith('biz:')) {
      const sent = await sync.sendRaw(chat.accountId, chat.peerId, text);
      return { tgMsgId: sent.id };
    }
    const account = await store.getAccount(chat.accountId);
    const bot = getBot();
    if (!bot || !account?.businessConnectionId) throw new Error('business connection unavailable');
    const sent = await bot.api.sendMessage(Number(chat.peerId), text, {
      business_connection_id: account.businessConnectionId,
    });
    return { tgMsgId: sent.message_id };
  };
}

async function handleCommand(ctx: Context, deps: BotDeps, name: string, text: string): Promise<void> {
  const ownerId = ctx.from?.id;
  if (!ownerId) return;
  const target = await deps.resolveContact(ownerId, name);
  if (!target) {
    await ctx.reply(`"${name}" degan bitta mijoz topilmadi. Ismini to'liq yozing (u avval sizga yozgan bo'lishi kerak).`);
    return;
  }
  const res = await deps.sender.send(target.accountId, target.chatId, text, 'owner');
  await ctx.reply(res.ok ? `✅ ${name}ga yuborildi.` : `⛔ Yuborilmadi: ${res.reason}`);
}

function toBizMessage(chatId: string, m: Message, fromOwner: boolean): TgMessage {
  return {
    id: messageKey(chatId, m.message_id),
    chatId,
    tgMsgId: m.message_id,
    direction: fromOwner ? 'out' : 'in',
    author: fromOwner ? 'owner' : 'customer',
    text: m.text ?? '',
    sentAt: new Date(m.date * 1000).toISOString(),
  };
}
