# Botir AI — Arxitektura (MVP, Mars IT Hackathon 24–25.11.2026)

**Bir gap bilan**: har bir biznesga o'zbekcha gaplashadigan AI sotuvchi-operator (biznes agenti), har bir odamga shu bizneslar bilan o'zi gaplashadigan shaxsiy AI yordamchi (shaxsiy agent).
**Wow-moment**: agent agent bilan jonli muzokara qiladi (so'rov → taklif → chegirma → kelishuv), odam faqat "Tasdiqlayman" bosadi. Hakamlar buni ekranda real vaqtda ko'radi.

Rollar: Javod — frontend/UI (apps/web), Ibrat — backend/DB (apps/api), Habibulloh — arxitektura va agentlar (apps/api/src/agents + docs).

## 1. Tizim xaritasi

```
  Mijoz                      Biznes egasi
   │ Telegram bot / Web chat   │ Web panel (katalog, buyurtmalar, CRM)
   ▼                           ▼
 apps/web (Next.js) ──REST + SSE──► apps/api (NestJS)
                                    ├── businesses   (profil, katalog, ish vaqti)
                                    ├── catalog-import (Excel/TG kanal/sayt → AI → mahsulotlar)
                                    ├── agents       (biznes agenti, shaxsiy agent, LLM tool-calling)
                                    ├── negotiation  (agent↔agent sessiya, raundlar, kelishuv)
                                    ├── orders       (buyurtma/band qilish, holatlar)
                                    ├── payments     (Payme/Click havola + webhook, faqat KIRIM)
                                    ├── channels     (Telegram bot; keyin Instagram, ovoz)
                                    └── analytics    (nima so'raldi, nima yo'q, qaytmagan mijoz)
                                         │
                       Postgres (Supabase) · LLM API · Telegram Bot API · Payme/Click
```

## 2. Monorepo

```
apps/web          Next.js 16 (App Router, TS) + Tailwind 4 + shadcn/ui — Javod
apps/api          NestJS + Prisma + Postgres — Ibrat; agents/ — Habibulloh
packages/shared   umumiy tiplar, DTO, API kontrakti (zod) — hamma
docs/             arxitektura, qarorlar
```
Qoida: web ↔ api faqat `@botir/shared` kontrakti orqali; agent logikasi faqat api ichida (brauzerda LLM kaliti yo'q).

## 3. Agentlar

**Biznes agenti** (har biznesga bitta): tizim prompti = biznes profili + katalog + qoidalar (min narx, maks chegirma %, ish vaqti).
Tools: `search_catalog`, `check_availability`, `make_offer(items, price, discount)`, `create_order`, `create_payment_link`.
Qoida: chegirma `maxDiscountPct` dan oshmaydi — bu kodda tekshiriladi, LLM'ga ishonilmaydi.

**Shaxsiy agent** (har foydalanuvchiga): foydalanuvchi gapini rejaga ajratadi ("osh joy band qil + servisga yozdir" → 2 vazifa).
Tools: `find_businesses(category, area, time)`, `start_negotiation(businessId, request)`, `compare_offers`, `ask_user_confirm(offer)`.
Qoida: to'lov va yakuniy band qilish faqat foydalanuvchi "Tasdiqlayman" bosgandan keyin.

**Muzokara (negotiation)**: `NegotiationSession` — ikkala agent navbatma-navbat `Message` yozadi (maks 6 raund). Har xabar SSE orqali web'ga oqadi (jonli ko'rinish). Tugash holatlari: `agreed` (Offer bilan) / `rejected` / `timeout`.

## 4. Ma'lumotlar modeli

```
User(id, tgId, name, phone?, createdAt)
Business(id, ownerId, name, category[restaurant|shop|autoservice|clinic], area, hours JSON, maxDiscountPct, createdAt)
Product(id, businessId, name, price, unit, stock?, meta JSON)
Conversation(id, businessId, userId?, channel[telegram|web], createdAt)
Message(id, conversationId?, sessionId?, role[user|biz_agent|personal_agent|system], text, toolCall JSON?, at)
NegotiationSession(id, userId, businessId, request, status[running|agreed|rejected|timeout], round, createdAt)
Offer(id, sessionId, items JSON, total, discountPct, expiresAt, status[proposed|accepted|declined])
Order(id, businessId, userId, offerId?, items JSON, total, status[new|confirmed|paid|done|cancelled], slotAt?)
Payment(id, orderId, provider[payme|click], externalId, amount, status[pending|paid|failed])   -- faqat KIRIM
```

## 5. API kontrakti (MVP)

```
POST /auth/telegram                     → { token }
POST /businesses                        → Business         (ulanish)
POST /businesses/:id/catalog/import     (file | tgChannel | url) → { imported }
GET  /businesses/:id/products
POST /chat/:businessId     {text}       → { reply }        (mijoz ↔ biznes agenti)
POST /assistant            {text}       → { tasks[] }      (shaxsiy agent rejasi)
POST /negotiations         {businessId, request} → NegotiationSession
GET  /negotiations/:id/stream           SSE: message | offer | status
POST /offers/:id/accept                 → Order + { payUrl }
GET  /businesses/:id/orders
GET  /businesses/:id/analytics          → { topAsked[], missing[], lostClients[] }
POST /payments/webhook/:provider        (imzo tekshiriladi, idempotent)
```
Javob formati: `{ ok: true, data } | { ok: false, error }`.

## 6. Web ekranlar (apps/web)

1. `/` — landing (bir gap + "Biznesni ulash" / "Yordamchini sinash")
2. `/connect` — biznes ulash: ma'lumot + katalog yuklash (Excel) → agent tayyor
3. `/dashboard` — biznes: buyurtmalar, suhbatlar, analitika
4. `/assistant` — shaxsiy agent chati
5. `/live/:sessionId` — **jonli muzokara**: chapda mijoz agenti, o'ngda biznes agenti, pastda taklif kartasi + "Tasdiqlayman"

## 7. Pul va xavfsizlik

- To'lov faqat **KIRIM** (havola + webhook). Refund/payout/o'tkazma kodda yo'q.
- Sirlar faqat `.env`; LLM kaliti faqat api'da.
- `userId`/`businessId` egaligi JWT'dan tekshiriladi.
- Agent tool'lari server tomonda validatsiya qilinadi (narx, chegirma, stock).
- Rate-limit: `/chat`, `/assistant`, `/negotiations`.

## 8. Deploy

web → Vercel · api → Railway/Render · DB → Supabase Postgres.
Env: `NEXT_PUBLIC_API_URL`, `DATABASE_URL`, `JWT_SECRET`, `LLM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `PAYME_*`, `CLICK_*`.

## 9. Git qoidasi

Default branch `main`. Har kim o'z branchida (`web/...`, `api/...`, `agents/...`, `docs/...`) → PR → `main`.

## 10. MVP tartibi (17:00 gacha)

1. shared kontrakt + Prisma sxema + api skelet (Ibrat) / web skelet + landing (Javod)
2. Business + Product + Excel import (seed: 3 demo biznes — osh markazi, avtoservis, do'kon)
3. Biznes agenti chat (`/chat`) — LLM + tools
4. Muzokara + SSE + `/live` ekran — wow qism
5. Offer accept → Order → to'lov havolasi
6. Telegram bot kanali (biznes agenti bilan gaplashish)
7. Deploy 16:00, tekshiruv 16:30, topshirish 17:00
