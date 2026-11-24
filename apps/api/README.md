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

## Demo / test account
Seed: 3 demo biznes (`isDemo: true`) — `biz-osh` (Chilonzor Osh Markazi), `biz-auto` (Chilonzor AutoService),
`biz-shop` (Mini Market) + katalog + 24 golden case. Auth hali yo'q: `userId` body'da keladi (web `localStorage`).

```bash
curl localhost:4000/health
curl -X POST localhost:4000/agent/request -H 'Content-Type: application/json' \
  -d '{"userId":"demo-user","text":"Ertaga 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzorda moy almashtirish"}'
curl -N localhost:4000/negotiations/<id>/stream            # SSE, ~40-60 s, o'tgan eventlar replay qilinadi
curl -X POST localhost:4000/negotiations/<id>/confirm -H 'Content-Type: application/json' -d '{"businessId":"biz-osh"}'
```

## Endpoints
- `GET /health`
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

## To'lov (faqat KIRIM)
`confirm` faqat `PaymentLinkProvider.createPaymentLink(order)` ni chaqiradi (`src/payments/payment-link.ts`, token `PAYMENT_LINK`).
Hozir `TestPaymentLinkProvider` (TEST havola). Haqiqiy TezCheck moduli (Ibrat, `api/tezcheck`) `app.module.ts` da
`{ provide: PAYMENT_LINK, useExisting: <TezcheckProvider> }` bilan almashtiradi. Refund/payout/withdraw kodi yo'q.

## Tuzilma
`db/` Prisma + `PrismaAgentStore` (agents `AgentStore`) + `PrismaTgStore` (tg-connect `TgStore`) ·
`negotiations/` agent request, SSE, confirm, agent→shared event mapper · `businesses/` CRUD, import, analytics ·
`tg/` tg-connect + inbox + bot · `loop/` LoopEngine · `payments/` link port + TEST provider.
Agent qatlami (`src/agents`) ichki tiplari `src/agents/shared.ts` da (PR#1 dan oldingi shakl); web'ga faqat `@botir/shared` chiqadi.
