// Telegram Connect domain types + persistence contract (ARCHITECTURE.md §12).
// Nest wraps TgStore with a Prisma/DB implementation; MemoryTgStore is for dev/demo.

export type ChatMode = 'copilot' | 'command' | 'autopilot' | 'off';
export type AccountKind = 'userbot' | 'business';
export type MessageDirection = 'in' | 'out';
export type MessageAuthor = 'customer' | 'owner' | 'ai';

export interface TgAccount {
  id: string;
  kind: AccountKind;
  tgUserId: string;
  username?: string;
  /** AES-256-GCM encrypted StringSession (userbot only). Never log it. */
  sessionEnc?: string;
  /** Telegram Business connection id (business only). */
  businessConnectionId?: string;
  connectedAt: string; // ISO
  /** Soft delete: set on disconnect, sessionEnc is wiped. */
  deletedAt?: string;
}

export interface Draft {
  text: string;
  confidence: number;
  needsHuman: boolean;
  createdAt: string; // ISO
}

export interface Chat {
  id: string; // `${accountId}:${peerId}`
  accountId: string;
  peerId: string; // Telegram user/chat id
  title: string;
  username?: string;
  mode: ChatMode;
  needsHuman: boolean;
  draft?: Draft;
  lastMessageAt?: string; // ISO
}

export interface TgMessage {
  id: string; // `${chatId}:${tgMsgId}`
  chatId: string;
  tgMsgId: number;
  direction: MessageDirection;
  author: MessageAuthor;
  text: string;
  sentAt: string; // ISO
}

export interface TgStore {
  saveAccount(account: TgAccount): Promise<void>;
  getAccount(accountId: string): Promise<TgAccount | undefined>;
  upsertChat(chat: Chat): Promise<Chat>;
  getChat(chatId: string): Promise<Chat | undefined>;
  saveMessage(message: TgMessage): Promise<void>;
  listChats(accountId: string): Promise<Chat[]>;
  /** Oldest first. `limit` keeps the newest N. */
  listMessages(chatId: string, limit?: number): Promise<TgMessage[]>;
  setChatMode(chatId: string, mode: ChatMode): Promise<Chat | undefined>;
}

export const chatKey = (accountId: string, peerId: string): string => `${accountId}:${peerId}`;
export const messageKey = (chatId: string, tgMsgId: number): string => `${chatId}:${tgMsgId}`;
