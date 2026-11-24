# Botir AI

Mars IT Hackathon monorepo — O'zbekistonning AI agentlar tarmog'i: biznes agenti + shaxsiy
agent, **agent↔agent muzokara**. Mijoz agenti so'raydi, biznes agenti taklif beradi, chegirma
bo'yicha kelishadi — odam faqat **Tasdiqlayman** bosadi.

- `apps/web` — Next.js (frontend)
- `apps/api` — NestJS + Prisma (backend)
- `packages/shared` — umumiy TS tiplar va API kontrakti
- `docs/ARCHITECTURE.md` — arxitektura

---

## Tez ishga tushirish (jyuri uchun)

Mahsulotni ko'rish uchun **backend shart emas**: `apps/web` API'ga ulanmasa, avtomatik
**Demo rejim**iga o'tadi (ichida demo bizneslar va muzokara oqimi bor). Interfeysdagi
belgi "Demo" yoki "Jonli" ekanini ko'rsatadi.

```bash
pnpm install          # pnpm 10.33+ kerak (corepack use pnpm@10.33.0)
pnpm dev:web          # http://localhost:3000
```

### To'liq (jonli) rejim — backend bilan

```bash
# 1. Postgres (lokal)
#    docker: postgres:16, user/parol/baza = botir/botir/botir, port 5432
#    yoki o'zingizdagi Postgres — faqat DATABASE_URL ni moslang

# 2. .env fayl (namuna: .env.example, repoga tushmaydi)
cp .env.example .env

# 3. Baza sxemasi va demo ma'lumot
cd apps/api
pnpm prisma:generate
pnpm prisma:push
pnpm seed

# 4. API
pnpm start:dev        # http://localhost:4000 — GET /health tekshiradi

# 5. Web (boshqa terminalda)
cd ../.. && pnpm dev:web
```

Tekshiruv: `curl http://localhost:4000/health` → `{"ok":true,"data":{"status":"ok","db":true,...}}`

---

## Test akkauntlar va kirish

| Nima | Qiymat |
|---|---|
| Web (demo rejim) | **Kirish talab qilinmaydi** — `http://localhost:3000` ni ochish kifoya |
| Biznes kabineti | `/dashboard` — demo rejimda ochiq |
| Shaxsiy yordamchi | `/assistant` — matn kiritiladi, muzokara `/live/:id` da ko'rinadi |
| Jonli rejim avtorizatsiyasi | `POST /auth/telegram` (Telegram Login Widget imzosi tekshiriladi) |
| Lokal sinov uchun token | `TELEGRAM_BOT_TOKEN` bo'lmasa, API imzoni tekshirmaydi va `{ "id": "demo-owner", "auth_date": "<unix>" }` bilan JWT beradi — **faqat lokal**, deployda ishlatilmaydi |
| Seed egasi | `tgId = demo-owner` (3 demo biznes egasi) |
| Seed mijozi | `tgId = demo-customer` (Ali) |

### Demo so'rov (muzokarani ko'rish uchun)

`/assistant` ga:

```
Ertaga 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzorda moy almashtirishga yozdir
```

Natija: ikki vazifa ajratiladi → mos bizneslarga REQUEST → OFFER (narx katalogdan) →
COUNTER (chegirma so'raladi) → ACCEPT/REJECT (chegirma biznes limitidan oshmaydi) →
**Tasdiqlayman** → buyurtma va to'lov havolasi.

---

## Nima ishlaydi, nima yo'q (halol ro'yxat)

**Ishlaydi:** demo rejimdagi butun oqim · `/health` · `auth/telegram` (JWT) ·
bizneslar va katalog CRUD · Excel/CSV import (ustun nomlari uz/ru/en) · buyurtmalar ·
analitika · inbox (rejimlar + rate limit) · A2A muzokara SSE orqali · buyurtma va
to'lov havolasini yaratish.

**Hali yo'q:** jonli LLM agentlari (`apps/api/src/agents` — Habibulloh zonasi; API tomonda
`AGENTS_BRIDGE` seam tayyor) · Telegram userbot sessiyasi (tg-connect) · ovozli xabar
transkripsiyasi · pgvector (hozircha `Float[]`).

**Baseline negotiator:** `apps/api/src/negotiations/rule-based.engine.ts` — bu **LLM emas**
va LLM deb ko'rsatilmaydi. Haqiqiy algoritm: narx DB katalogidan olinadi, chegirma
`business.maxDiscountPct` bilan cheklanadi (PolicyGuard, ARCHITECTURE §3.4), maksimum
3 raund. Jonli agentlar ulanganda shu seam almashtiriladi.

---

## Xavfsizlik

- Sirlar faqat `.env` da, repoda kalit/token yo'q (namuna: `.env.example`).
- **Pul faqat KIRIM.** Kodda refund/payout/withdraw/transfer funksiyasi **umuman yo'q** —
  ataylab, o'chirilgan holda ham emas (ARCHITECTURE §1).
- Telegram sessiyasi shifrlangan maydonda (`tg_accounts.sessionEnc`), ochiq saqlanmaydi.
- Har mutatsiya endpointida biznes izolyatsiyasi: `businessId` egasi token egasi bo'lishi
  tekshiriladi (`BusinessesService.assertOwner`).
- Webhook imzosi HMAC-SHA256 bilan tekshiriladi, qayta kelgan callback idempotent.
- Kirish validatsiyasi `class-validator` + `whitelist: true`; `any` yo'q; `console.log`
  o'rniga Nest Logger.

Qoida: har kim o'z branchida → PR → `main`.
