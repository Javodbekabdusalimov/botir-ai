# Botir AI — Arxitektura (MVP, Mars IT Hackathon 24–25.11.2026)

Mahsulot: qarz va pul oqimi AI-yordamchisi (Fintech + B2B). Bitta "miya", ikki yo'nalish:
- **B2C — Shaxs**: qarzlar, maosh taqsimlagich, qarzdan chiqish rejasi + "qarzsiz sana", xarajat (matn/ovoz), eslatmalar.
- **B2B — Biznes**: nasiya xarid/sotuv, debitorka/kreditorka, kassa uzilishi prognozi, undiruv havolasi.

## 1. Tizim xaritasi

```
 Foydalanuvchi
   ├── Telegram bot (grammY)  ──┐
   └── Web panel (Next.js)    ──┤ HTTPS (REST, JSON)
                                ▼
                       apps/api (NestJS)
             ┌──────────┬───────────┬────────────┬──────────────┐
             │ auth     │ debts     │ planner    │ payments     │
             │ users    │ expenses  │ ai (LLM)   │ (TezCheck)   │
             │ business │ forecast  │ reminders  │ webhook      │
             └────┬─────┴─────┬─────┴──────┬─────┴──────┬───────┘
                  ▼           ▼            ▼            ▼
          Postgres (Supabase)  LLM API   Cron/queue   TezCheck API
```

## 2. Monorepo

```
apps/web          Next.js (App Router, TS, Tailwind + shadcn/ui) — Javod
apps/api          NestJS (TS, REST, Prisma) + bot moduli — Ibrat
packages/shared   umumiy tiplar, DTO, API kontrakti (zod sxemalar) — hamma
docs/             arxitektura, qarorlar — Habibulloh
```

Qoida: web va api bir-birining ichiga import qilmaydi; faqat `@botir/shared` orqali.

## 3. Backend modullari (apps/api)

- **auth** — Telegram login (bot `initData` / Login Widget) → JWT. Parol yo'q.
- **users** — profil: maosh sanalari (masalan 5 va 20), oylik daromad, oila soni.
- **debts** — qarz: turi (bank, mikroqarz, karta, nasiya, shaxsiy berdim/oldim), qoldiq, stavka, oylik to'lov, sana, jarima.
- **planner** — maosh taqsimlagich (qarz → uy/kommunal → oziq-ovqat → zaxira → qarzni ortiqcha yopish → erkin); avalanche/snowball reja; qarzsiz sana; qarz yuki % (DSTI, >50% qizil); yangi qarz simulyatori. **Sof funksiya, LLM'siz** — hisob deterministik, testlanadi.
- **expenses** — xarajat kiritish; matn/ovoz → `ai` kategoriya beradi.
- **ai** — LLM o'rami: kategoriya, matndan qarz/xarajat ajratish, maslahat matni. Raqamlarni LLM hisoblamaydi, faqat `planner` natijasini tushuntiradi.
- **business** — kontragent, nasiya xarid/sotuv, debitorka/kreditorka.
- **forecast** — kassa prognozi: kelgusi 30 kun kirim/chiqim → "N kunda X so'm kamomad → kimdan undirish".
- **reminders** — to'lovdan 3 va 1 kun oldin bot xabari (cron).
- **payments** — TezCheck: hisob (bill) yaratish + webhook → `paid`. Premium obuna uchun.
- **bot** — grammY, webhook rejimi, faqat api servislarini chaqiradi (biznes logika botda emas).

## 4. Ma'lumotlar modeli (asosiy)

```
User(id, tgId, name, salaryDays[], income, createdAt)
Debt(id, userId, kind, title, balance, rate, monthly, dueDay, penalty, status)
Payment(id, debtId, amount, paidAt)
Expense(id, userId, amount, category, note, source[text|voice], at)
Plan(id, userId, strategy[avalanche|snowball], debtFreeDate, snapshot JSON)
Business(id, ownerId, name)
Counterparty(id, businessId, name, phone, kind[client|supplier])
Credit(id, businessId, counterpartyId, direction[receivable|payable], amount, dueAt, status)
Bill(id, userId, provider, externalId, amount, status, createdAt)  -- faqat KIRIM
```

## 5. API kontrakti (namuna)

```
POST /auth/telegram            → { token }
GET  /me                       → User
CRUD /debts
POST /plan/split   {salary}    → konvertlar
GET  /plan                     → { strategy, debtFreeDate, months[] }
POST /expenses     {text|audio}→ Expense (AI kategoriya)
CRUD /business/credits
GET  /business/forecast        → { gapDay, gapAmount, collectFrom[] }
POST /payments/bill            → { payUrl }
POST /payments/webhook         (TezCheck, imzo tekshiriladi)
```
Javob formati: `{ ok: true, data } | { ok: false, error }` (`@botir/shared`).

## 6. Pul qoidasi (QAT'IY)

- Faqat **KIRIM**: TezCheck orqali hisob yaratish + webhook. Yechish, o'tkazish, refund, payout — kodda ham, API'da ham **yo'q**.
- Webhook imzosi tekshiriladi, `externalId` bo'yicha idempotent.
- Biznes mijozlarining to'lovi biznesning o'z kassasiga; bizning kassaga faqat obuna/premium.

## 7. Xavfsizlik

- Sirlar faqat `.env` (repoda `.env.example`); `.env` `.gitignore`da.
- Har endpointda `userId` JWT'dan, body'dan emas (boshqaning qarzini ko'rish mumkin emas).
- Validatsiya: zod/class-validator; rate-limit auth va AI endpointlarda.
- LLM'ga faqat kerakli maydonlar yuboriladi (telefon/karta raqami yo'q).

## 8. Deploy

- web → Vercel; api + bot → Railway (yoki Render); DB → Supabase Postgres.
- Env: `NEXT_PUBLIC_API_URL`, `DATABASE_URL`, `JWT_SECRET`, `LLM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TEZCHECK_*`.

## 9. Git qoidasi

- Default branch `main`. Har kim o'z branchida (`web/...`, `api/...`, `docs/...`) → PR → `main`.
- `main`ga to'g'ridan push yo'q (hackathon tezligi uchun 1 review yetarli).

## 10. MVP tartibi (17:00 gacha)

1. shared tiplar + api skeleti + DB sxema
2. debts CRUD + planner (taqsimlash, reja, qarzsiz sana) — wow qism
3. web: qarzlar ro'yxati, taqsimlagich, reja ekrani
4. bot: qarz qo'shish, eslatma, xarajat matn
5. TezCheck premium to'lov
6. B2B minimal: nasiya, debitorka/kreditorka, kassa prognozi
7. Deploy 16:00, tekshiruv 16:30
