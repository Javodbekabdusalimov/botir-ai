import { MeTelegram } from "./me-telegram";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Telegram ulash", description: "Shaxsiy Telegramni ulash.", path: "/me/telegram", noindex: true });

export default function MeTelegramPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold text-agent">Shaxsiy agent</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Telegramingizni ulang</h1>
      <p className="mt-3 text-muted-foreground">
        Agent sizning nomingizdan yozishi uchun Telegram akkauntingizni ulang. Har bir xabar avval sizdan ruxsat so&apos;raydi.
      </p>
      <MeTelegram />
    </div>
  );
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
