# Life Assistant — flows (sequence diagrams)

Companion to `AGENTS.md`. Each diagram names the real files involved, so a reader can jump straight to the code.

## 1. Client request → live negotiation → confirm → payment

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as Web (apps/web)
    participant A as API (Nest)
    participant P as PersonalAgent
    participant N as Negotiator
    participant B as BusinessAgent
    participant G as PolicyGuard
    participant T as PaymentLinkProvider

    U->>W: "Ertaga 18:00 ga 6 kishilik osh joy band qil" (/assistant)
    W->>A: POST /agent/request {userId, text}
    A-->>W: {negotiationId, tasks: []}  (returns immediately)
    W->>W: router.push(/live/:id)  (always, when negotiationId exists)
    W->>A: GET /negotiations/:id/stream  (SSE, replay on reconnect)
    A->>P: parse(text) → tasks (haiku)
    P->>P: findBusinesses(task)
    par one lane per matching business
        loop round 1..3 (MAX_ROUNDS)
            N->>B: respond(history, round) (sonnet)
            B->>G: checkOffer(draft) → computeTotal() from catalog
            G-->>B: ok | repaired (+ PolicyViolation)
            B-->>N: OFFER {items, discountPct, total}
            N-->>A: event: message / best_offer
            A-->>W: SSE event (de-duplicated client-side)
            N->>P: decide(offer) → accept | counter | reject
        end
    end
    A-->>W: event: status {agreed | rejected | failed}
    U->>W: [Tasdiqlayman]
    W->>A: POST /negotiations/:id/confirm {businessId}  (idempotent)
    A->>T: createPaymentLink(order)  (inbound only)
    A-->>W: {orderId, paymentLink}
    W->>W: /pay/:orderId (checkout)
    loop every 2–3 s
        W->>A: GET /payments/:orderId/status
    end
    A-->>W: {status: paid} → "To'landi ✅"
```

Failure handling in the web client (`apps/web/src/lib/api.ts`, `app/live/[id]/live-view.tsx`):
- SSE drops before the stream finishes → automatic reconnect (1 s, 2 s, 4 s, 4 s, 4 s); replayed events are skipped.
- Stream ends with `rejected`/`failed` → "Bu safar kelishuv bo'lmadi" + [Qayta urinish] (re-sends the original text) + [So'rovni o'zgartirish].
- `GET /payments/:id/status` → 404 → `NotFoundError` → "Buyurtma topilmadi" (never a fake "paid").
- Backend unreachable → scripted mock and the header badge switches to "Demo".

## 2. Payment settlement (no webhooks)

```mermaid
flowchart LR
    C[confirm / subscription] --> L[PaymentLinkProvider.createPaymentLink]
    L -->|TEZCHECK_API_KEY set| TZ[TezcheckPaymentLinkProvider<br/>POST /bills, Idempotency-Key botir-id]
    L -->|no key| TS[TestPaymentLinkProvider<br/>GET /pay/test/:orderId]
    TZ --> PL[payment-poller.service<br/>every 5 s, 30 min]
    TS --> PL
    PL -->|paid && livemode| S[payment-settlement.service]
    S --> O[Order → paid]
    S --> PRO[Business plan=pro, +30 days, +AI credits]
```

No refund, payout, withdraw or cancel path exists. The TezCheck client makes exactly two calls: create bill, read bill.

## 3. Self-improvement loop (human in the loop)

```mermaid
flowchart TD
    F[Auditor findings<br/>incl. not_found] --> R[LoopEngine.run businessId]
    R --> PR[≤ 3 proposals: prompt / catalog / faq]
    PR -->|prompt| E[Evaluator: golden set before vs after<br/>deterministic price check + haiku judge]
    E -->|after > before| PEN[pending, shows evalBefore → evalAfter]
    E -->|otherwise| REJ[auto-rejected]
    PR -->|catalog / faq| PEN
    PEN -->|owner approves| V[new PromptVersion active]
    V -->|owner| RB[rollback → previous version]
```

Nothing changes agent behaviour until the owner approves. Catalog proposals never invent a price; the owner sets it.

## 4. Auth and ownership

```mermaid
flowchart LR
    R[POST /auth/register or /login] --> J[JWT HS256, 7 days<br/>localStorage botir_token]
    J --> H[Authorization: Bearer]
    H --> G{AuthGuard}
    G -->|no token| E401[401]
    G -->|not owner| E403[403]
    G -->|owner| OK[catalog / business writes]
```

Public (no login): `GET` businesses, catalog, analytics; `POST /agent/request`; SSE stream; confirm; payment status.
