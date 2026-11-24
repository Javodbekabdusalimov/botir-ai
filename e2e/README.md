# E2E (Playwright) — ishga tushirish

Spec: `e2e/botir.spec.ts`. Skrinshotlar `e2e/screenshots/` ga tushadi:
**1440** (desktop) va **390** (mobil) o'lchamda, har qadam uchun alohida fayl.

```bash
pnpm add -D -w @playwright/test
npx playwright install chromium

# web ishga tushgan bo'lishi kerak (boshqa terminalda):
pnpm dev:web

# demo rejimda (backend shart emas):
npx playwright test

# jonli rejimda (backend bilan):
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm dev:web
npx playwright test
```

`playwright.config.ts` repoda yo'q (mening mashinamdagi xavfsizlik hook'i deploy
konfiglarini bloklaydi). Quyidagini root'ga qo'ying:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
});
```

## Nega /login yo'q

Topshiriqda "/login, test akkaunt +998900000002 / botir123" deyilgan, lekin mahsulotda
bunday oqim YO'Q: `apps/web` da `/login` sahifasi yo'q, telefon/parol maydonlari yo'q,
bu akkauntlar repoda va seed'da uchramaydi. Kontrakt (`packages/shared`) va
ARCHITECTURE §6 bo'yicha kirish — `POST /auth/telegram` (Telegram Login Widget imzosi).

Shuning uchun spec jyuri ko'radigan yo'ldan boradi: `/` → `/assistant` → `/live/:id`
→ **Tasdiqlayman** → to'lov sahifasi. To'lov QILINMAYDI.

## Spec nimani tekshiradi

1. Landing ochiladi, rejim belgisi ("Demo" yoki "Jonli") ko'rinadi — va qaysi rejimda
   o'tgani test annotatsiyasiga yoziladi. Bu muhim: backend o'lik bo'lsa frontend
   mock'ga tushadi va test "yashil" bo'lib qolardi, lekin hech narsani isbotlamasdi.
2. `/assistant` ga so'rov kiritiladi va yuboriladi.
3. `/live/:id` da A2A muzokara oqimi chiqadi: mijoz agenti satri va narx ko'rinadi.
4. **Tasdiqlayman** bosiladi, to'lov sahifasi ochiladi (to'lamaymiz).
5. Biznes kabineti: `/dashboard` va `/dashboard/inbox` ochiladi.
