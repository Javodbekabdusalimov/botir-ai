# BOTIR AI — Arxitektura (v1, 24.11.2026)

> Bu fayl repoga `docs/ARCHITECTURE.md` bo'lib tushadi. AI-agentingizga bering.
> Qarorlar egasi (Habibulloh) bilan grill-raundlarda kelishilgan — o'zgartirishdan oldin Habibullohdan so'rang.

## 0. Bir jumla
Har biznesga o'zbek/rus tilida gaplashadigan AI sotuvchi-operator (B2B) + har odamga shu bizneslar bilan o'zi gaplashadigan shaxsiy AI yordamchi (B2C). Agentlar o'zaro muzokara qiladi, odam faqat "Tasdiqlayman" bosadi.

## 1. Qabul qilingan qarorlar
| # | Qaror |
|---|---|
| Stek | **NestJS** (apps/api) + **Next.js** (apps/web) + **Postgres + pgvector** + TypeScript, monorepo |
| Joylashuv | Hozircha **hammasi Habibullohning Mac'ida lokal** ishlaydi; kod to'liq repoda. Server/deploy — keyin |
| LLM | **Habibullohning Claude Max akkaunti** (lokal `claude` CLI login) orqali, Claude Agent SDK. API-kalit hozircha YO'Q. Agentlar — `sonnet`, parser/auditor — `haiku` |
| Embedding/RAG | **O'zimizning model** — lokal embed-server `http://127.0.0.1:8766` (bge-m3, 1024 o'lcham). Faqat `POST /embed` ishlatiladi. ⚠️ `/add` ni CHAQIRMANG — bu Habibullohning shaxsiy indeksi, mahsulot ma'lumoti u yerga tushmaydi. Vektorlar bizning Postgres/pgvector'da saqlanadi |
| RAG v1 | Katalog ≤200 pozitsiya → to'liq kontekstga + Postgres qidiruv. pgvector + embed — pilotga |
| Ovoz | Hozir `stt.sh` (NotebookLM, lokal). Serverga ko'chganda — Whisper |
| Telegram bot | Bitta bot, NestJS ichida modul (grammY). Token faqat `.env` |
| Telegram Connect | Ikki usul: **A — Telegram Business** (rasmiy, Premium kerak) va **B — userbot** (gramjs: telefon → kod → 2FA, butun tarix). Demo: B, Habibullohning akkauntida |
| Javob rejimi | Default **Copilot** (AI qoralama, egasi tasdiqlaydi) · **Buyruq** ("Aliga yoz: …") · **Autopilot** (egasi o'zi yoqadi) |
| Odamga uzatish | Shikoyat, pul qaytarish, katalogdan tashqari savol, ishonch < 70% → odamga |
| Muzokara | Jonli LLM-agentlar, maks **3 raund**, chegirma ≤ biznes limiti (default 0%), pul faqat "Tasdiqlayman" dan keyin |
| Xotira | **Hamma narsa xotiraga yoziladi**: har xabar, har qaror, har muzokara, mijoz faktlari |
| O'z-o'zini yaxshilash | Auditor topadi → taklif → oltin misollarda test → **odam tasdiqlaydi** → yomonlashsa rollback |
| Pul | TezCheck: **faqat kirim**. Yechish/refund/payout kodda YO'Q. Biznes mijozi to'lovi → biznesning o'z kassasi (demo: TezCheck test provider). Bizning Real Match kassaga faqat Botir obunasi |
| Obsidian | Jamoa bilim bazasi (arxitektura, qaror, promptlar, loop hisobotlari). Prodga ulanmaydi |

## 2. Umumiy sxema
```
 Mijoz (Telegram)         Biznes egasi (Web kabinet + Telegram)
      │                              │
      ▼                              ▼
┌──────────────── apps/api  (NestJS) ───────────────────────────────┐
│ auth · businesses · catalog · orders · bookings · payments        │
│ conversations · memory · analytics · telegram-bot · tg-connect    │
│                                                                   │
│  ┌──────────── agents/ (Habibulloh) ───────────────────────────┐  │
│  │ PersonalAgent   (B2C: gapni vazifalarga bo'ladi, qidiradi)  │  │
│  │ BusinessAgent   (B2B: katalog, slot, taklif, buyurtma)      │  │
│  │ Negotiator      (A2A protokol: REQUEST→OFFER→COUNTER→ACCEPT)│  │
│  │ PolicyGuard     (LLMsiz, sinxron: narx/chegirma/spam limit) │  │
│  │ Auditor         (har suhbatdan keyin, async, haiku)         │  │
│  │ LoopEngine      (kunlik + tugma: taklif→eval→tasdiq)        │  │
│  │ Memory          (yozish/o'qish, RAG)                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────┬──────────────┬───────────────┬──────────────┬─────────────┘
       ▼              ▼               ▼              ▼
  Postgres+pgvector  Claude (Max,   embed-server   TezCheck API
  (hamma ma'lumot)   Agent SDK)     :8766 /embed   (create-bill + webhook)
       ▲
 apps/web (Next.js): landing · kabinet · inbox · muzokara ekrani (SSE) · CRM
```

## 3. Agentlar (batafsil)
### 3.1 BusinessAgent (har biznesga bittasi, bitta kod — biznes konfigi bilan)
Kontekst: biznes profili + ish vaqti + katalog + qoidalar (maks chegirma, yetkazish) + mijoz xotirasi + suhbat tarixi.
Toollar:
- `search_catalog(query)` → pozitsiyalar (narx DB dan, LLM narx to'qimaydi)
- `check_slot(date, time, people|service)` → bo'sh/band
- `make_offer(items[], discountPct)` → PolicyGuard tekshiradi
- `create_order(...)` / `create_booking(...)` → status `pending_confirm`
- `create_payment_link(orderId)` → TezCheck (faqat kirim)
- `handoff_to_human(reason)`
Chiqish: `{reply, intent, confidence, toolCalls[]}`.

### 3.2 PersonalAgent (har foydalanuvchiga)
1. Parse (haiku): "ertaga 18:00 6 kishilik osh + Chilonzorda moy almashtirish" → `tasks[] {category, when, where, people, budget}`.
2. Discovery: kategoriya + joy + ish vaqti bo'yicha bizneslar (v1 SQL, pilot — pgvector).
3. Har vazifa uchun 1–3 biznes agentiga parallel REQUEST.
4. Takliflarni solishtiradi → muzokara (Negotiator) → eng yaxshisi.
5. Foydalanuvchiga karta: nima, qayerda, qachon, narx, chegirma → **[Tasdiqlayman] [Boshqasi]**.
6. Tasdiq → buyurtma/bron `confirmed` → to'lov havolasi.

### 3.3 A2A muzokara protokoli
```
REQUEST  {taskId, need, when, people, budget}
OFFER    {items[], price, discountPct, validUntil, slot}
COUNTER  {askDiscountPct, reason}         // maks 3 raund
ACCEPT | REJECT {reason}
```
Har xabar `negotiation_messages` ga yoziladi va SSE orqali web ekranga real-time chiqadi (WOW ekran).

### 3.4 PolicyGuard (LLM yo'q — oddiy kod, har chiqishda)
- narx = katalog narxi × (1 − chegirma); chegirma ≤ `business.maxDiscountPct`
- faqat katalogdagi pozitsiya; slot band bo'lsa — taklif yo'q
- Telegram: notanish odamga BIRINCHI yozish va ommaviy yuborish TAQIQ; rate limit (masalan 20 xabar/daq/akkaunt)
- autopilot faqat ish vaqtida; handoff qoidalari (shikoyat/refund/katalogdan tashqari/confidence<0.7)
- pul: faqat `create-bill`; payout/refund/withdraw funksiyasi kodda umuman yo'q
Buzilsa → xabar bloklanadi, `policy_violations` ga yoziladi, agentga "qayta yoz" signali.

### 3.5 Auditor (async, haiku)
Har yopilgan suhbatdan keyin: to'qilgan narx/fakt? qoida buzilishi? javobsiz qolgan savol? "topilmadi" so'rovi? → `audit_findings`.

### 3.6 LoopEngine (loop engineering)
Kunlik + kabinetda "Yaxshilash" tugmasi:
1. `audit_findings` + "topilmadi" so'rovlari to'planadi.
2. Taklif: prompt tuzatish / katalogga yangi pozitsiya / FAQ.
3. **Oltin to'plam** (har biznesga 20 savol-javob) da eski va yangi versiya solishtiriladi (haiku-judge).
4. Yaxshilansa → egasiga "tasdiqlang"; yomonlashsa → rad. Tasdiqlansa `prompt_versions` ga yangi versiya; rollback bitta tugma.

### 3.7 Memory (hamma narsa yoziladi)
- **Xom:** har xabar (`messages`), har muzokara (`negotiation_messages`), har tool chaqiruv va LLM chaqiruv (`llm_calls`: model, token, ms).
- **Faktlar:** suhbatdan keyin haiku fakt chiqaradi → `memory_facts {subjectType: customer|user|business, subjectId, fact, source, confidence}` ("Ali — osh yaxshi ko'radi, Chilonzorda yashaydi").
- **RAG:** `kb_chunks {businessId, text, embedding vector(1024)}` — katalog, FAQ, eski suhbatlar; embedding = embed-server `/embed`.
- Agent har chaqiruvda: profil + top-faktlar + (pilot) top-k chunk.

## 4. Telegram Connect (biznes o'z Telegramini ulaydi)
- **B — userbot (gramjs):** kabinetda telefon → kod → (2FA) → `StringSession` **AES-256-GCM bilan shifrlanib** `tg_accounts.sessionEnc` ga (kalit `.env` `TG_SESSION_KEY`). Ulangach: oxirgi N dialog tarixi import → `chats`, `messages` (kim, qachon, nima). Yangi xabarlar — event handler.
- **A — Telegram Business:** egasi Telegram sozlamalarida botimizni ulaydi → bot `business_connection` / `business_message` update oladi → shu oqimga tushadi.
- Rejimlar chat bo'yicha: `copilot | command | autopilot | off`.
- **Buyruq rejimi:** egasi botga "Aliga yoz: buyurtmangiz tayyor" → resolve chat → PolicyGuard → egasining nomidan yuboriladi.
- Uzish: bitta tugma → sessiya o'chiriladi (soft delete + sessionEnc tozalanadi).
- Demo: Habibullohning akkaunti. Autopilot demoda faqat oq ro'yxatdagi 1–2 test chatda.

## 5. Ma'lumotlar bazasi (Ibrat) — asosiy jadvallar
Hammasida `id uuid, createdAt, updatedAt, isDeleted, deletedAt` (soft delete).
- `users` (B2C: tgId, name, phone, lang)
- `businesses` (name, category, address, district, geo, workHours json, maxDiscountPct, lang, ownerUserId, isDemo)
- `catalog_items` (businessId, name, description, price, unit, durationMin, inStock, tags)
- `slots` / `bookings` (businessId, start, end, people, status)
- `orders` (businessId, userId, items json, total, discountPct, status: draft|pending_confirm|confirmed|paid|cancelled)
- `payments` (orderId, provider, billId, link, amount, status, webhookRaw) — faqat kirim
- `negotiations` (userId, taskJson, status) + `negotiation_messages` (negotiationId, fromAgent, type, payload, createdAt)
- `tg_accounts` (businessId, mode A|B, phone, sessionEnc, status)
- `chats` (tgAccountId, peerId, title, mode, lastMessageAt, needsHuman)
- `messages` (chatId, direction in|out, author customer|owner|ai, text, voiceUrl, transcript, tgMsgId, sentAt)
- `memory_facts`, `kb_chunks (embedding vector(1024))`
- `audit_findings`, `prompt_versions`, `golden_cases`, `eval_runs`
- `policy_violations`, `llm_calls`

## 6. API kontrakti (Ibrat ↔ Javod, BIRINCHI kelishiladi)
`packages/shared` da TS tiplar. Asosiylari:
```
POST /auth/telegram            (Telegram Login Widget) → {token}
GET  /businesses               ?category&district
POST /businesses               {name, category, ...}
POST /businesses/:id/catalog/import   (Excel/CSV) → {imported}
GET/POST/PATCH /businesses/:id/catalog
GET  /businesses/:id/orders    ?status
GET  /businesses/:id/analytics → {topRequests[], notFound[], lostCustomers[], revenue}
POST /tg-connect/start         {phone} → {loginId}
POST /tg-connect/code          {loginId, code, password?} → {status}
GET  /inbox                    ?businessId → chats[]
GET  /inbox/:chatId/messages
POST /inbox/:chatId/send       {text}              (copilot tasdiq / qo'lda)
PATCH /inbox/:chatId/mode      {mode}
POST /agent/request            {userId, text} → {negotiationId}
GET  /negotiations/:id/stream  (SSE)  → har A2A xabar
POST /negotiations/:id/confirm → {orderId, paymentLink}
POST /payments/webhook/tezcheck   (imzo tekshiriladi)
POST /loop/run                 {businessId} → {proposals[]}
POST /loop/proposals/:id/approve | /reject
```

## 7. Repo tuzilmasi
```
botir-ai/
  apps/api/src/{auth,businesses,catalog,orders,bookings,payments,inbox,tg-connect,telegram-bot,analytics}
  apps/api/src/agents/{personal,business,negotiator,policy-guard,auditor,loop,memory,llm}
  apps/web/          (Next.js App Router)
  packages/shared/   (tiplar, API kontrakt, zod sxemalar)
  docs/ARCHITECTURE.md · docs/TASKS.md · docs/prompts/
  .env.example       (.env — FAQAT lokal, .gitignore da)
```
`.env.example`: `DATABASE_URL, TELEGRAM_BOT_TOKEN, TG_API_ID, TG_API_HASH, TG_SESSION_KEY, EMBED_URL=http://127.0.0.1:8766, TEZCHECK_API_KEY, TEZCHECK_WEBHOOK_SECRET, JWT_SECRET`

## 8. Xavfsizlik (jyuri agenti kodni tekshiradi)
- Sir faqat `.env`; repoda kalit/token/session yo'q (commitdan oldin `git diff` tekshiring).
- Telegram session shifrlangan; webhook imzosi tekshiriladi; har endpointda biznes izolyatsiyasi (`businessId` = token egasiniki).
- Input validatsiya (zod/class-validator), rate limit, `any` yo'q, prod'da `console.log` yo'q (Nest Logger).
