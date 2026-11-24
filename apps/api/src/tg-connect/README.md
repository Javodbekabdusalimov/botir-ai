# tg-connect — Telegram Connect (ARCHITECTURE.md §12–13)

Framework-agnostic TypeScript classes. NestJS wraps them as providers; persistence goes through the `TgStore` interface (`MemoryTgStore` for dev/demo, replace with a Prisma implementation).

| File | What |
|---|---|
| `types.ts` | `TgAccount`, `Chat`, `TgMessage`, `ChatMode`, `TgStore` |
| `crypto.ts` | AES-256-GCM session encrypt/decrypt — `base64(iv12 \| tag16 \| ciphertext)` |
| `userbot-login.ts` | `UserbotLogin.start(phone)` → `{loginId}`; `submitCode(loginId, code, password?)` → `ok \| need_password \| error` (2FA SRP via `computeCheck`). Pending logins live 5 min in memory |
| `sync.ts` | `TgSync.connect(accountId)` — imports the last 30 dialogs × 50 messages, then listens to `NewMessage` → store + `onIncoming(chat, msg)`. `disconnect()` = logout + session wipe (soft delete) |
| `sender.ts` | `Sender.send(accountId, chatId, text, 'owner'\|'ai', {hours})` — PolicyGuard: no first message to unknown peers, no bulk, 20/min per account, AI only in `autopilot` and only within business hours |
| `modes.ts` | `ModeHandler.handleIncoming` — copilot → draft; autopilot → send if confidence ≥ 0.7 and not `needsHuman`, otherwise flag `needsHuman`; command/off → nothing |
| `../telegram-bot/bot.ts` | grammY bot: `/start`, text → personal agent, voice → `stt.sh` → agent, "Aliga yoz: …" command mode, Telegram Business (`business_connection`, `business_message`), offer buttons |

## Env (`.env`, never commit)

```
TG_API_ID=123456              # my.telegram.org → API development tools
TG_API_HASH=...               # secret
TG_SESSION_KEY=<64 hex chars> # openssl rand -hex 32  — encrypts sessions at rest
TELEGRAM_BOT_TOKEN=...        # @BotFather; if empty the bot is disabled (warning, no crash)
```

Phone codes, 2FA passwords, session strings and the API hash are never logged.

## Nest wiring (sketch)

```ts
// tg-connect.module.ts (providers via useFactory)
const store = new MemoryTgStore();                       // → PrismaTgStore later
let modes: ModeHandler;                                   // assigned below
const onIncoming = (c: Chat, m: TgMessage) => modes.handleIncoming(c, m).then(() => undefined);
const sync = new TgSync(store, onIncoming);
let bot: Bot | null = null;
const sender = new Sender(store, makeTransport(store, () => bot, sync));
modes = new ModeHandler(store, sender, agents.draftReply, (accountId) => hoursOf(accountId));
const login = new UserbotLogin(store, undefined, (id) => void sync.connect(id));
const created = createBot({ store, sender, onIncoming, personalAgent, resolveContact, confirmOffer });
bot = created.bot;
if (bot) startBot(bot);
// on app start: for each stored userbot account → sync.connect(accountId)
```

## API endpoints it backs

| Method | Path | Calls |
|---|---|---|
| POST | `/tg-connect/start` `{phone}` | `login.start(phone)` → `{loginId}` |
| POST | `/tg-connect/code` `{loginId, code, password?}` | `login.submitCode(...)` → `{status}` (on `ok` sync starts) |
| GET | `/inbox?accountId=` | `store.listChats(accountId)` (with `draft`, `needsHuman`, `mode`) |
| GET | `/inbox/:chatId/messages` | `store.listMessages(chatId, 100)` |
| POST | `/inbox/:chatId/send` `{text}` | `sender.send(accountId, chatId, text, 'owner')` — "Yuborish" button on a draft |
| PATCH | `/inbox/:chatId/mode` `{mode}` | `modes.setMode(chatId, mode)` |

All responses as `{ ok: true, data } | { ok: false, error }` (`packages/shared`).

## Checks

```
pnpm exec tsc -p apps/api/src/tg-connect/tsconfig.check.json
pnpm exec tsx apps/api/src/tg-connect/crypto.test.ts
pnpm exec tsx apps/api/src/tg-connect/guards.test.ts
```
Live login (real phone/code) is not covered by tests — done manually at demo time.
