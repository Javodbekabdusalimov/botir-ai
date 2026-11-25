# AGENTS.md — Botir AI, for AI agents and reviewers

> O'zbekcha qisqa: bu fayl AI agentlar (Claude, Codex, Cursor, hakam-AI) uchun loyiha xaritasi. Kodni o'zgartirishdan oldin to'liq o'qing.

Botir AI is an Uzbek **agent-to-agent commerce network**. Every business gets an AI seller agent; every person
gets a personal agent. The person types one sentence ("6 kishilik osh + Chilonzorda moy almashtirish"); the personal agent
splits it into tasks, negotiates with each matching business agent in parallel (REQUEST → OFFER → COUNTER → ACCEPT,
max 3 rounds), and the human only presses **Tasdiqlayman**. Money moves only after that press, and only inbound (TezCheck).

Read in this order: this file → `docs/FLOWS.md` (sequence diagrams) → `docs/ARCHITECTURE.md` (decisions, Uzbek) →
`packages/shared/src/index.ts` (the API contract) → `apps/api/src/agents/README.md` (agent layer) → `apps/api/README.md` (endpoints).

---

## 1. Repository map

```
packages/shared/src/index.ts   Single source of truth for the HTTP/SSE contract (types only). Web and API both import it.
apps/api/                      NestJS + Prisma (SQLite). Runtime: tsx (no decorator metadata → always @Inject(Token)).
  src/agents/                  Framework-free agent layer (plain TS classes, no Nest imports):
    personal-agent.ts            parse(text) → tasks, findBusinesses(task), decide(offer) accept|counter|reject
    business-agent.ts            LLM reply + offer draft; totals recomputed in code, violations repaired + logged
    negotiator.ts                A2A loop ≤ MAX_ROUNDS (3), emits NegotiationEvent per step
    policy-guard.ts              Deterministic rules, NO LLM: catalog-only, total = Σ price×qty×(1−d), d ≤ maxDiscountPct
    auditor.ts, memory.ts        Post-session review → findings; fact extraction → per-user memory
    loop/                        Self-improvement: golden-set eval before/after, human approve, rollback
    llm/llm-client.ts            The only LLM entry point (Claude Agent SDK or `claude -p`), every call logged
  src/negotiations/            POST /agent/request, SSE stream, confirm → Order + payment link
  src/payments/                PaymentLinkProvider port: TestPaymentLinkProvider | TezcheckPaymentLinkProvider, poller
  src/businesses/              CRUD, catalog (+ CSV/XLSX import), analytics, memory
  src/auth/                    register/login/me, JWT HS256, AuthGuard, @Auth(), @CurrentUser()
  src/tg*, tg-connect/         Telegram Business / userbot connect (AES-256-GCM session), inbox, bot
  src/loop/                    HTTP surface of LoopEngine
  src/knowledge/               Business knowledge: sources → draft facts → owner confirms. Agent side: knowledge-context.ts (prompt section),
                               questions.service.ts (unknown questions), turn-recorder + metrics.service.ts (AI-answered %)
apps/web/                      Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui. Read apps/web/AGENTS.md (breaking changes).
  src/lib/api.ts                 Every backend call. Timeouts, SSE with reconnect, mock fallback, Jonli/Demo mode store
  src/lib/mock.ts                Scripted demo data used ONLY when the API is unreachable (or id starts with "demo")
  src/hooks/use-negotiation.ts   Turns raw SSE events into per-business lanes with typing/stagger animation
  src/app/live/[id]              The "wow" screen: two agents negotiating live, final offer card, confirm
  src/app/pay/[orderId]          Checkout (TEST or TezCheck), status polling, success card, 404 state
  src/app/dashboard/*            Business owner panel: KPIs, orders, inbox, agent test chat, self-improvement
e2e/                           Playwright walk-through (assistant → live → confirm → payment page)
render.yaml                    Render blueprint: ai-assistant (web) + ai-assistant-api (API), both from `main`
```

## 2. Invariants — never break these

1. **Prices are never trusted from the LLM.** Totals are computed in `computeTotal()` (`policy-guard.ts`) from catalog
   prices. An LLM offer that violates policy is clamped/repaired and a `PolicyViolation` is recorded. Discount ≤ business `maxDiscountPct`.
2. **Max 3 negotiation rounds** (`MAX_ROUNDS`). The UI shows "Raund n/3".
3. **Money is inbound only.** `confirm` and subscriptions call `PaymentLinkProvider.createPaymentLink()` and nothing else.
   There is no refund / payout / withdraw / cancel code, by design. Only `paid && livemode` counts as paid.
4. **Nothing is booked or paid before the human confirms.** `negotiator.confirm()` only marks the offer accepted;
   the Order + payment link are created by `POST /negotiations/:id/confirm`.
5. **Owner-only business data.** Catalog writes (`POST|PATCH|DELETE /businesses/:id/catalog*`, `/catalog/import`),
   `/businesses/:id/orders|analytics|memory`, `/inbox*`, `/tg-connect*` and `/loop/*` use `@Auth()` + owner check
   (`auth/ownership.ts`): 401 without token (before any lookup), 403 for another business. Catalog reads stay public
   (agents read catalogs). `/tg-connect/code` accepts only a login started for a business the caller owns, otherwise 404.
   `/businesses/:id/knowledge*` is owner-only too. Prices must be ≥ 0. `/agent/request` takes the user from the Bearer token when present;
   a guest may not act under a registered user's id.
6. **Response envelope** is always `{ ok: true, data } | { ok: false, error }`.
7. **Web mode badge is honest.** `lib/api.ts` shows "Demo" only when the backend is unreachable (network error / 5xx /
   unparsable body). A 404 means the backend is alive: it never flips the badge, and endpoints that must not fake data
   (`/payments/:id/status`) throw `NotFoundError` → "Buyurtma topilmadi". Exactly one badge is visible at any width.
8. **SSE contract:** each event's `data` = `JSON.stringify(NegotiationEvent)`; named events `message | best_offer | status | error`.
   The server replays past events on reconnect, so the client de-duplicates. Do not add `es.onmessage` (would double every message).
9. **`/agent/request` returns immediately** with `{ negotiationId, tasks: [] }`; parsing continues in the background.
   The client must navigate to `/live/:id` whenever `negotiationId` is present, regardless of `tasks.length`.
10. **Telegram safety** (PolicyGuard): never the first message to an unknown peer, ≤ 20 msgs/min per account,
    autopilot only within business hours (Asia/Tashkent).
11. **No secrets in git.** `.env*` is ignored (only `.env.example` is tracked). Render secrets are `sync: false`.
12. **Dashboard shows agent work, not revenue.** The AI cannot know a business's real revenue, so KPIs are:
    orders via Botir, AI negotiations, not-found requests, AI-answered %. Knowledge metrics are `null` without data, never a fake 0.
13. **The business agent uses only owner-confirmed knowledge of its own business.** `loadKnowledge()` is the only path into the prompt
    (negotiations, inbox drafts, evaluator, auditor): `status = confirmed`, not deleted, one `businessId`, size-capped. Draft and catalog
    facts never enter it; product prices and discounts still come only from the catalog and PolicyGuard.
14. **The agent does not invent.** A question outside catalog/facts → reply says "aniqlab beraman" and sets `unknownQuestion` →
    `PendingQuestion` (a reply with an unknown question is never auto-sent in autopilot). The owner's answer (panel, or a Telegram reply to
    that exact bot message, from that chat, while still linked) becomes a confirmed FAQ. Dismissed questions are not reopened.
    Bot notifications: once per question, ≤ 10 per business per hour. Recording turns/questions is best effort and never happens in evaluation.

## 3. Run, test, verify

```bash
pnpm install                         # repo root (pnpm 10, Node ≥ 22)
cp .env.example apps/api/.env        # at least DATABASE_URL="file:./dev.db"
pnpm dev:api                         # prisma generate + db push + seed + watch → http://localhost:4000
echo NEXT_PUBLIC_API_URL=http://localhost:4000 > apps/web/.env.local
pnpm dev:web                         # http://localhost:3000 (header badge must say "Jonli")
```

- LLM: the API uses the logged-in `claude` CLI / Claude Agent SDK (`LLM_MODE=sdk`, fallback `cli`). On a server set `CLAUDE_CODE_OAUTH_TOKEN`.
- Test accounts (seeded, idempotent): business `+998900000001` / `botir123` (owner of `biz-osh`), client `+998900000002` / `botir123`.
- Seeded businesses: `biz-osh` (Chilonzor Osh Markazi), `biz-auto` (Chilonzor AutoService), `biz-shop` (Mini Market), 24 golden cases.
- Typecheck: `pnpm --filter api typecheck` · Web: `pnpm --filter web build` and `pnpm --filter web lint`.
- Agent knowledge test (no network): see the header of `apps/api/src/knowledge/agent-knowledge.test.ts`.
- E2E: see `e2e/README.md`.

**Definition of done for any change:** build + lint green, the golden path works end to end against the real API
(`/assistant` → "Ertaga 18:00 ga 6 kishilik osh joy band qil" → `/live/:id` → Tasdiqlayman → `/pay/:orderId` → "To'landi"),
and screens checked at 1440 px and 390 px (no horizontal overflow: `scrollWidth === innerWidth`).

## 4. Golden path, with real numbers

Osh for 6 at Chilonzor Osh Markazi: catalog 270 000 so'm → client agent counters → business agent offers the allowed
5 % → **256 500 so'm**, agreed in round 2/3 in ~15–20 s. Confirm creates the order and a TEST payment link
(`GET /pay/test/:orderId`, no real money unless `TEZCHECK_API_KEY` is set); the web polls `GET /payments/:orderId/status`
every 2–3 s and shows the success card.

## 5. Where to change what

- New endpoint → add types to `packages/shared`, implement in the matching Nest module, call it from `apps/web/src/lib/api.ts`
  (with a `mock.ts` fallback only if a fake value cannot mislead the user).
- Agent behaviour → `apps/api/src/agents/*` (prompts live next to the agent); prove it with the golden set (`loop/evaluator.ts`).
- Money logic → only through `PaymentLinkProvider`; never add outbound money flows.
- UI copy is Uzbek (Latin). Numbers: `256 500 so'm` (use `formatSom`). Motion 150–300 ms ease-out, respect `prefers-reduced-motion`.

## 6. Team and ownership

Habibulloh: architecture and agents · Ibrat: backend · Javodbek: frontend/UI, repo owner. Branch + PR into `main`;
Render auto-deploys `main` (web: ai-assistant-f16u.onrender.com, API: ai-assistant-api-u384.onrender.com).
