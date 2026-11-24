import { Api, TelegramClient } from 'telegram';
import type { EntityLike } from 'telegram/define';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { decryptSession } from './crypto';
import { createLogger, errMsg } from './logger';
import { loadTgApiCreds, type TgApiCreds } from './tg-env';
import { chatKey, messageKey, type Chat, type TgMessage, type TgStore } from './types';

// Connected userbot accounts: history import + live NewMessage → store + onIncoming.

const log = createLogger('tg-sync');

export type OnIncoming = (chat: Chat, msg: TgMessage) => Promise<void> | void;
/** Message the account owner wrote to their own "Saved Messages" (B2C: commands to Botir). */
export type OnSelf = (accountId: string, text: string) => Promise<void> | void;

export interface SyncOptions {
  dialogs?: number; // default 30
  messagesPerDialog?: number; // default 50
}

interface Connected {
  client: TelegramClient;
  peers: Map<string, EntityLike>; // peerId → input peer (for sending)
  sentIds: Set<number>; // our own sends, so the echo event doesn't overwrite author 'ai'
  selfId: string; // own Telegram user id = "Saved Messages" peer
}

export function toTgMessage(chatId: string, m: Api.Message): TgMessage {
  return {
    id: messageKey(chatId, m.id),
    chatId,
    tgMsgId: m.id,
    direction: m.out ? 'out' : 'in',
    author: m.out ? 'owner' : 'customer',
    text: m.message ?? '',
    sentAt: new Date(m.date * 1000).toISOString(),
  };
}

export class TgSync {
  private readonly connected = new Map<string, Connected>();

  constructor(
    private readonly store: TgStore,
    private readonly onIncoming: OnIncoming,
    private readonly creds: TgApiCreds = loadTgApiCreds(),
    private readonly onSelf?: OnSelf,
  ) {}

  /** Decrypts the stored session, connects, imports history, subscribes to new messages. */
  async connect(accountId: string, opts: SyncOptions = {}): Promise<{ chats: number; messages: number }> {
    const account = await this.store.getAccount(accountId);
    if (!account?.sessionEnc) throw new Error(`Account ${accountId} has no session`);
    await this.disconnect(accountId, false);

    const client = new TelegramClient(
      new StringSession(decryptSession(account.sessionEnc)),
      this.creds.apiId,
      this.creds.apiHash,
      { connectionRetries: 5 },
    );
    client.setLogLevel(LogLevel.NONE);
    await client.connect();
    const conn: Connected = { client, peers: new Map(), sentIds: new Set(), selfId: account.tgUserId };
    this.connected.set(accountId, conn);

    const stats = await this.importHistory(accountId, conn, opts);
    client.addEventHandler((e: NewMessageEvent) => void this.handleNew(accountId, conn, e), new NewMessage({}));
    log.info(`${accountId}: synced ${stats.chats} chats / ${stats.messages} messages, listening`);
    return stats;
  }

  private async importHistory(accountId: string, conn: Connected, opts: SyncOptions) {
    const dialogs = await conn.client.getDialogs({ limit: opts.dialogs ?? 30 });
    let chats = 0;
    let messages = 0;
    for (const d of dialogs) {
      // Only 1:1 chats with real people (customers), not bots/groups/channels.
      if (!d.isUser || !d.id || !(d.entity instanceof Api.User) || d.entity.bot || d.entity.self) continue;
      const peerId = d.id.toString();
      conn.peers.set(peerId, d.inputEntity);
      const chat = await this.store.upsertChat({
        id: chatKey(accountId, peerId),
        accountId,
        peerId,
        title: d.title || d.name || peerId,
        username: d.entity.username ?? undefined,
        mode: 'copilot',
        needsHuman: false,
      });
      const history = await conn.client.getMessages(d.inputEntity, { limit: opts.messagesPerDialog ?? 50 });
      for (const m of history) {
        if (!(m instanceof Api.Message) || !m.message) continue;
        await this.store.saveMessage(toTgMessage(chat.id, m));
        messages++;
      }
      chats++;
    }
    return { chats, messages };
  }

  private async handleNew(accountId: string, conn: Connected, e: NewMessageEvent): Promise<void> {
    try {
      const m = e.message;
      if (!e.isPrivate || !m.message || !m.chatId) return;
      if (m.out && conn.sentIds.delete(m.id)) return;
      const peerId = m.chatId.toString();
      // Saved Messages is not a customer chat (importHistory skips it too).
      if (peerId === conn.selfId) {
        if (m.out) await this.onSelf?.(accountId, m.message);
        return;
      }
      const sender = await m.getSender();
      if (sender instanceof Api.User && sender.bot) return;
      const input = await m.getInputChat();
      if (input) conn.peers.set(peerId, input);

      const id = chatKey(accountId, peerId);
      const existing = await this.store.getChat(id);
      const chat =
        existing ??
        (await this.store.upsertChat({
          id,
          accountId,
          peerId,
          title: peerTitle(await m.getChat()) || peerId,
          mode: 'copilot',
          needsHuman: false,
        }));
      const msg = toTgMessage(chat.id, m);
      await this.store.saveMessage(msg);
      if (msg.direction === 'in') await this.onIncoming(chat, msg);
    } catch (err) {
      log.error(`${accountId}: new message handling failed: ${errMsg(err)}`);
    }
  }

  /** Low-level send used by Sender (guards are applied there, not here). */
  async sendRaw(accountId: string, peerId: string, text: string): Promise<Api.Message> {
    const conn = this.connected.get(accountId);
    if (!conn) throw new Error(`Account ${accountId} is not connected`);
    const peer = conn.peers.get(peerId) ?? (await conn.client.getInputEntity(peerId));
    const sent = await conn.client.sendMessage(peer, { message: text });
    conn.sentIds.add(sent.id);
    if (conn.sentIds.size > 500) conn.sentIds.clear();
    return sent;
  }

  /** Reply into the owner's own "Saved Messages". */
  async sendToSelf(accountId: string, text: string): Promise<void> {
    const conn = this.connected.get(accountId);
    if (!conn) throw new Error(`Account ${accountId} is not connected`);
    const sent = await conn.client.sendMessage('me', { message: text });
    conn.sentIds.add(sent.id);
  }

  isConnected(accountId: string): boolean {
    return this.connected.has(accountId);
  }

  /** "Uzish" button: logout=true also revokes the Telegram session and wipes it from the store (soft delete). */
  async disconnect(accountId: string, logout = true): Promise<void> {
    const conn = this.connected.get(accountId);
    this.connected.delete(accountId);
    if (conn && logout) await conn.client.invoke(new Api.auth.LogOut()).catch(() => undefined);
    await conn?.client.destroy().catch(() => undefined);
    if (!logout) return;
    const account = await this.store.getAccount(accountId);
    if (account) {
      await this.store.saveAccount({ ...account, sessionEnc: undefined, deletedAt: new Date().toISOString() });
      log.info(`${accountId}: disconnected, session wiped`);
    }
  }
}

function peerTitle(entity: unknown): string {
  if (entity instanceof Api.User) return [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || '';
  if (entity instanceof Api.Chat || entity instanceof Api.Channel) return entity.title;
  return '';
}
