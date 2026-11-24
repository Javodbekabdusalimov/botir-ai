import { MeActions } from "./me-actions";

export const metadata = { title: "Amallar | Botir AI" };

export default function MeActionsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold text-agent">Shaxsiy agent</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Ruxsat kutayotgan amallar</h1>
      <p className="mt-3 text-muted-foreground">Agent sizning Telegramingizdan xabar yuborishdan oldin ruxsat so&apos;raydi. Siz tasdiqlamaguncha hech narsa ketmaydi.</p>
      <MeActions />
    </div>
  );
}

// Sahifa auth-guard ichida: kirishdan oldin render qilinmaydi
export const instant = false;
