import { TelegramConnect } from "./telegram-connect";

export const metadata = { title: "Telegramni ulash | Botir AI" };

export default function TelegramPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <p className="text-sm font-medium text-biz">Kanal</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Telegramni ulang</h1>
      <p className="mt-3 text-muted-foreground">Agent mijozlar bilan sizning Telegram akkauntingiz orqali gaplashadi.</p>
      <TelegramConnect />
    </div>
  );
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
