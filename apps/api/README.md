# apps/api — Botir AI backend (NestJS + Prisma/SQLite)

Modullar va kontrakt: `docs/ARCHITECTURE.md`, `packages/shared/src/index.ts` (API kontrakti).
Javob formati: `{ ok: true, data } | { ok: false, error }`.

## Setup
```bash
pnpm install                                   # repo root
cp .env.example apps/api/.env                  # kamida: DATABASE_URL="file:./dev.db"
pnpm dev:api                                   # prisma db push + seed + tsx watch → http://localhost:4000
```
- LLM: logged-in `claude` CLI (Claude Max, API key kerak emas). `LLM_MODE=cli` — `claude -p` fallback.
- DB: SQLite `apps/api/prisma/dev.db` (gitignored). Qayta seed: `pnpm --filter api db:seed` (idempotent).
- Typecheck: `pnpm --filter api typecheck`.
- Runtime: `tsx` (esbuild) — shuning uchun DI da har doim `@Inject(Token)` aniq yoziladi (decorator metadata yo'q).

## Env
| Key | Nima uchun | Bo'lmasa |
|---|---|---|
| `DATABASE_URL` | SQLite fayl | majburiy |
| `PORT`, `CORS_ORIGINS` | 4000, `http://localhost:3000` | default |
| `TELEGRAM_BOT_TOKEN` | grammY bot | bot o'chiq (warn log) |
| `TG_API_ID`, `TG_API_HASH`, `TG_SESSION_KEY` | userbot login / inbox | `/tg-connect/*` → 503 |
| `PUBLIC_API_URL` | TEST to'lov havolasi bazasi | `http://localhost:4000` |
| `TEZCHECK_API_KEY`, `TEZCHECK_CASH_DESK_CODE`, `TEZCHECK_API_URL` | haqiqiy TezCheck hisob (bill) | TEST havola (`/pay/test`) |
| `PLAN_PRO_PRICE`, `PLAN_PRO_CREDITS` | Pro obuna narxi (so'm/oy) va AI kvota | 1000, 1000 |
| `STT_CMD` | audio fayl → matn: bajariladigan fayl yo'li (audio yo'lini argument qilib oladi, matnni stdout'ga yozadi; shell yo'q) | audio yuklash → 503, brauzer diktovkasi taklif qilinadi |
| `AUTH_SECRET` | `/auth` JWT (HS256) imzosi | har boot'da random (warn log), tokenlar restartda o'ladi |

## Demo / test account
Seed: 3 demo biznes (`isDemo: true`) — `biz-osh` (Chilonzor Osh Markazi), `biz-auto` (Chilonzor AutoService),
`biz-shop` (Mini Market) + katalog + 24 golden case. `/agent/request` va GET endpointlar ochiq (login shart emas): `userId` body'da keladi (web `localStorage`).

### Test akkauntlar (seed, idempotent)
| Rol | Telefon | Parol | Biznes |
|---|---|---|---|
| `business` | `+998900000001` | `botir123` | `biz-osh` (Chilonzor Osh Markazi) |
| `user` | `+998900000002` | `botir123` | — (id `demo-user`) |

```bash
TOKEN=$(curl -s -X POST localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+998900000001","password":"botir123"}' | jq -r .data.token)
curl localhost:4000/auth/me -H "Authorization: Bearer $TOKEN"     # {user, businessId}
```

```bash
curl localhost:4000/health
curl -X POST localhost:4000/agent/request -H 'Content-Type: application/json' \
  -d '{"userId":"demo-user","text":"Ertaga 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzorda moy almashtirish"}'
curl -N localhost:4000/negotiations/<id>/stream            # SSE, ~40-60 s, o'tgan eventlar replay qilinadi
curl -X POST localhost:4000/negotiations/<id>/confirm -H 'Content-Type: application/json' -d '{"businessId":"biz-osh"}'
```

## Endpoints
- `GET /health`
- `POST /auth/register {name, phone, password, role:'business'|'user'}`, `POST /auth/login {phone, password}` → `{token, user}`;
  `GET /auth/me` (Bearer) → `{user, businessId?}`. Telefon → `+998XXXXXXXXX`. Parol: scrypt, token: JWT HS256 (7 kun).
  Login talab qiladi (`@Auth()`): `POST /businesses`, `PATCH|DELETE /businesses/:id` (faqat egasi). Qolganlari ochiq.
- `GET|POST /businesses`, `GET|PATCH|DELETE /businesses/:id` (soft delete)
- `GET|POST|PATCH /businesses/:id/catalog`, `PATCH|DELETE /businesses/:id/catalog/:itemId`,
  `POST /businesses/:id/catalog/import` (multipart `file` CSV/XLSX yoki JSON `{rows}`; ustunlar: name/nomi/название, price/narx/цена, unit/birlik)
- `GET /businesses/:id/orders`, `/analytics`, `/memory`
- `POST /agent/request` → `{negotiationId, tasks: []}` darhol; parse + muzokara fonda
- `GET /negotiations/:id/stream` (SSE: `event: <type>`, `data: NegotiationEvent`), `GET /negotiations/:id`
- `POST /negotiations/:id/confirm {businessId}` → `{orderId, paymentLink}` (idempotent)
- `GET /pay/test/:orderId` — **TEST** to'lov sahifasi (haqiqiy pul emas)
- `POST /tg-connect/start|code`, `DELETE /tg-connect?businessId=`
- `GET /inbox?businessId=`, `GET /inbox/:chatId/messages`, `POST /inbox/:chatId/send|draft`, `PATCH /inbox/:chatId/mode`
- `POST /loop/run {businessId}` (~90 s, golden-set eval), `GET /loop/proposals?businessId=`,
  `POST /loop/proposals/:id/approve|reject`, `POST /loop/rollback {businessId}`

## Biznes bilimi (`src/knowledge/`)
Manba → AI **qoralama** faktlar → egasi tasdiqlaydi → faqat tasdiqlangani agentga yetadi. Hammasi `@Auth()` + egasi (401/403; begona id → 404).
- `GET /businesses/:id/knowledge` → `{sources, facts, questions, metrics}`
- `POST /businesses/:id/knowledge/sources/text {text, kind?:'text'|'voice'}` · `/url {url}` · `/telegram {chatIds}` · `/file` (multipart `file`, 10 MB:
  JPG/PNG/WEBP/PDF, audio — `STT_CMD` bo'lsa). Darhol `processing`, natija fonda `ready|failed` (`error` — o'zbekcha). Bir biznesda bir vaqtda 5 ta, ortig'i 429.
- `PATCH /businesses/:id/knowledge/facts/:factId`, `POST .../facts/confirm {ids}` (idempotent). Katalog fakti tasdiqlansa `CatalogItem` yaratiladi yoki
  nomi bo'yicha yangilanadi. Katalogdagi tasdiqlangan narxni rad etish → 409 (avval katalogdan o'chiriladi).
- `POST .../questions/:qid/answer {answer}`, `POST .../questions/:qid/dismiss`
- `POST /businesses/:id/sync-key` → `{key}` (bir marta ko'rinadi, bazada faqat sha256; yangisi eskisini bekor qiladi)
- `POST /sync/catalog` (`X-Sync-Key`) `{items:[{name, price, unit?, inStock?}]}` — 500 tagacha, nomi bo'yicha upsert, xato qatorlar `errors` da.
  Bu **umumiy push API**: iiko/1C bilan tayyor integratsiya EMAS va ular bilan sinalmagan; kassa tomonda skript/webhook kerak.

Xavfsizlik: manba matni LLM uchun data (ko'rsatma emas), har maydon kodda tekshiriladi (`fact-validation.ts`), narx — butun son ≥ 0.
Telegram matnidan telefon/karta/email LLM'gacha olib tashlanadi, iqtibosdan (`evidence`) har doim. AI yozgan xabarlar o'qilmaydi.
URL: faqat http/https 80/443, ochiq IP (tekshirilgan IP'ga ulanadi, har redirect qayta tekshiriladi), 3 redirect, 10 s, 2 MB, `text/html`.
JavaScript bilan chiziladigan yoki login so'raydigan sahifa (ko'pincha Instagram) o'qilmaydi — chetlab o'tilmaydi, `failed` bo'ladi.
Rasm/PDF uchun `LLM_MODE=sdk` kerak. Server qayta ishga tushsa `processing` manbalar `failed` bo'ladi (qayta yuboriladi).
Testlar: `pnpm exec tsx apps/api/src/knowledge/{url-guard,text-utils,fact-validation}.test.ts`.

## To'lov (faqat KIRIM)
`confirm` va obuna faqat `PaymentLinkProvider.createPaymentLink()` ni chaqiradi (`src/payments/payment-link.ts`, token `PAYMENT_LINK`).
`TEZCHECK_API_KEY` bor → `TezcheckPaymentLinkProvider` (`POST /bills`, `external_reference` = order id / `sub-…`, `Idempotency-Key: botir-<id>`),
yo'q → `TestPaymentLinkProvider`. Webhook YO'Q: holat **polling** bilan (`POST /bills/{bill}` o'qish) — `GET /payments/:orderId/status`
(3 s kesh) + fon tsikli har 5 s, 30 daqiqa. Faqat `paid && livemode` hisoblanadi. Paid → Order `paid` yoki biznes `plan=pro`,
`planUntil=+30 kun`, `aiCredits += PLAN_PRO_CREDITS`; egasiga Telegram bot xabari (bog'langan bo'lsa) + log.
TezCheck client faqat 2 chaqiruv: hisob yaratish va o'qish. Refund/payout/withdraw/cancel kodi yo'q.

- `GET /plans` → `[{id:'start',price:0,...},{id:'pro',price:PLAN_PRO_PRICE,...}]`
- `POST /businesses/:id/subscription {plan:'pro'}` (Bearer, faqat egasi) → `{paymentRef, payUrl, amount}` (30 daq ichida qayta bosish → o'sha hisob)
- `GET /payments/:orderId/status` → `{orderId, kind, status, amount, payUrl, paidAt?}`
- `GET /businesses/:id` va `GET /auth/me` (`business`) → `plan`, `planUntil`, `aiCredits`

## Tuzilma
`auth/` register/login/me, `AuthGuard` + `@Auth()`/`@CurrentUser()` · `db/` Prisma + `PrismaAgentStore` (agents `AgentStore`) + `PrismaTgStore` (tg-connect `TgStore`) ·
`negotiations/` agent request, SSE, confirm, agent→shared event mapper · `businesses/` CRUD, import, analytics ·
`tg/` tg-connect + inbox + bot · `loop/` LoopEngine · `payments/` link port + TEST provider.
Agent qatlami (`src/agents`) ichki tiplari `src/agents/shared.ts` da (PR#1 dan oldingi shakl); web'ga faqat `@botir/shared` chiqadi.
