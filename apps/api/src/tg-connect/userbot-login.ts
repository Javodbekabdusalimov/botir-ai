import { randomUUID } from 'node:crypto';
import { Api, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { computeCheck } from 'telegram/Password';
import { StringSession } from 'telegram/sessions';
import { encryptSession } from './crypto';
import { createLogger, errMsg } from './logger';
import { loadTgApiCreds, type TgApiCreds } from './tg-env';
import type { TgAccount, TgStore } from './types';

// Web-UI friendly userbot login: start(phone) → submitCode(code[, password]).
// Phone codes, 2FA passwords and session strings are NEVER logged.

const TTL_MS = 5 * 60 * 1000;
const log = createLogger('tg-login');

export type SubmitResult =
  | { status: 'ok'; accountId: string }
  | { status: 'need_password'; hint?: string }
  | { status: 'error'; error: string };

interface PendingLogin {
  client: TelegramClient;
  phone: string;
  phoneCodeHash: string;
  awaitingPassword: boolean;
  expiresAt: number;
}

const rpcCode = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'errorMessage' in e ? String((e as { errorMessage: unknown }).errorMessage) : '';

export class UserbotLogin {
  private readonly pending = new Map<string, PendingLogin>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly store: TgStore,
    private readonly creds: TgApiCreds = loadTgApiCreds(),
    /** Called after a successful login (e.g. start sync). */
    private readonly onConnected?: (accountId: string) => void,
  ) {
    this.sweeper = setInterval(() => void this.sweep(), 30_000);
    this.sweeper.unref();
  }

  async start(phone: string): Promise<{ loginId: string }> {
    const normalized = phone.replace(/[^\d+]/g, '');
    if (!/^\+?\d{9,15}$/.test(normalized)) throw new Error('Invalid phone number');
    const client = new TelegramClient(new StringSession(''), this.creds.apiId, this.creds.apiHash, {
      connectionRetries: 3,
    });
    client.setLogLevel(LogLevel.NONE);
    await client.connect();
    try {
      const { phoneCodeHash } = await client.sendCode(this.creds, normalized);
      const loginId = randomUUID();
      this.pending.set(loginId, {
        client,
        phone: normalized,
        phoneCodeHash,
        awaitingPassword: false,
        expiresAt: Date.now() + TTL_MS,
      });
      log.info(`code sent, loginId=${loginId}`);
      return { loginId };
    } catch (e) {
      await client.disconnect().catch(() => undefined);
      throw new Error(`sendCode failed: ${rpcCode(e) || errMsg(e)}`);
    }
  }

  async submitCode(loginId: string, code: string, password?: string): Promise<SubmitResult> {
    const p = this.pending.get(loginId);
    if (!p || p.expiresAt < Date.now()) {
      if (p) await this.drop(loginId);
      return { status: 'error', error: 'Login expired, start again' };
    }
    try {
      if (!p.awaitingPassword) {
        const res = await p.client.invoke(
          new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash, phoneCode: code.trim() }),
        );
        if (res instanceof Api.auth.AuthorizationSignUpRequired) {
          await this.drop(loginId);
          return { status: 'error', error: 'This phone has no Telegram account' };
        }
        return await this.finish(loginId, p);
      }
      return await this.checkPassword(loginId, p, password);
    } catch (e) {
      const codeName = rpcCode(e);
      if (codeName === 'SESSION_PASSWORD_NEEDED') {
        p.awaitingPassword = true;
        return this.checkPassword(loginId, p, password);
      }
      log.warn(`submitCode failed: ${codeName || 'unknown error'}`);
      if (codeName === 'PHONE_CODE_EXPIRED') await this.drop(loginId);
      return { status: 'error', error: codeName || 'Login failed' };
    }
  }

  private async checkPassword(loginId: string, p: PendingLogin, password?: string): Promise<SubmitResult> {
    const info = await p.client.invoke(new Api.account.GetPassword());
    if (!password) return { status: 'need_password', hint: info.hint };
    try {
      const srp = await computeCheck(info, password);
      await p.client.invoke(new Api.auth.CheckPassword({ password: srp }));
      return await this.finish(loginId, p);
    } catch (e) {
      const codeName = rpcCode(e);
      log.warn(`2FA failed: ${codeName || 'unknown error'}`);
      return { status: 'error', error: codeName === 'PASSWORD_HASH_INVALID' ? 'Wrong 2FA password' : codeName || '2FA failed' };
    }
  }

  private async finish(loginId: string, p: PendingLogin): Promise<SubmitResult> {
    const me = await p.client.getMe();
    const session = (p.client.session as StringSession).save();
    const account: TgAccount = {
      id: `ub:${me.id.toString()}`,
      kind: 'userbot',
      tgUserId: me.id.toString(),
      username: me.username ?? undefined,
      sessionEnc: encryptSession(session),
      connectedAt: new Date().toISOString(),
    };
    await this.store.saveAccount(account);
    await this.drop(loginId);
    log.info(`account connected: ${account.id}`);
    this.onConnected?.(account.id);
    return { status: 'ok', accountId: account.id };
  }

  private async drop(loginId: string): Promise<void> {
    const p = this.pending.get(loginId);
    this.pending.delete(loginId);
    await p?.client.disconnect().catch(() => undefined);
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, p] of this.pending) if (p.expiresAt < now) await this.drop(id);
  }

  dispose(): void {
    clearInterval(this.sweeper);
    for (const id of [...this.pending.keys()]) void this.drop(id);
  }
}
