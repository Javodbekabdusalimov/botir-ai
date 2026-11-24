import type { Chat, ChatMode, TgAccount, TgMessage, TgStore } from './types';

/** In-memory TgStore for dev/demo and tests. Data is lost on restart. */
export class MemoryTgStore implements TgStore {
  private readonly accounts = new Map<string, TgAccount>();
  private readonly chats = new Map<string, Chat>();
  private readonly messages = new Map<string, Map<string, TgMessage>>();

  async saveAccount(account: TgAccount): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async getAccount(accountId: string): Promise<TgAccount | undefined> {
    const acc = this.accounts.get(accountId);
    return acc && !acc.deletedAt ? { ...acc } : undefined;
  }

  async upsertChat(chat: Chat): Promise<Chat> {
    const prev = this.chats.get(chat.id);
    // Keep user-chosen mode when re-importing an existing chat.
    const next: Chat = prev ? { ...prev, ...chat, mode: prev.mode } : { ...chat };
    this.chats.set(chat.id, next);
    return { ...next };
  }

  async getChat(chatId: string): Promise<Chat | undefined> {
    const chat = this.chats.get(chatId);
    return chat ? { ...chat } : undefined;
  }

  async saveMessage(message: TgMessage): Promise<void> {
    let bucket = this.messages.get(message.chatId);
    if (!bucket) {
      bucket = new Map();
      this.messages.set(message.chatId, bucket);
    }
    bucket.set(message.id, { ...message });
    const chat = this.chats.get(message.chatId);
    if (chat && (!chat.lastMessageAt || chat.lastMessageAt < message.sentAt)) {
      chat.lastMessageAt = message.sentAt;
    }
  }

  async listChats(accountId: string): Promise<Chat[]> {
    return [...this.chats.values()]
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
      .map((c) => ({ ...c }));
  }

  async listMessages(chatId: string, limit?: number): Promise<TgMessage[]> {
    const all = [...(this.messages.get(chatId)?.values() ?? [])].sort((a, b) =>
      a.sentAt === b.sentAt ? a.tgMsgId - b.tgMsgId : a.sentAt.localeCompare(b.sentAt),
    );
    return (limit ? all.slice(-limit) : all).map((m) => ({ ...m }));
  }

  async setChatMode(chatId: string, mode: ChatMode): Promise<Chat | undefined> {
    const chat = this.chats.get(chatId);
    if (!chat) return undefined;
    chat.mode = mode;
    return { ...chat };
  }
}
