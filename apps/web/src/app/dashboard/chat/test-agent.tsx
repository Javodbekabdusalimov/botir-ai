"use client";

import { BotirChat } from "@/components/botir-chat";
import { useBusinessId } from "@/hooks/use-business";
import { useAsync } from "@/hooks/use-async";
import { getBusinesses } from "@/lib/api";

export function TestAgent() {
  const id = useBusinessId();
  const list = useAsync("businesses", getBusinesses);
  const name = list.data?.find((b) => b.id === id)?.name;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Agentni sinash" className="flex h-[min(42rem,calc(100dvh-14rem))] sm:h-[min(42rem,calc(100dvh-17rem))] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="grid size-10 place-items-center rounded-full bg-green-600 text-sm font-bold text-white">AI</span>
          <div className="min-w-0">
            <h2 className="truncate font-sans text-base font-extrabold tracking-tight">{name ?? "Biznes"} agenti</h2>
            <p className="flex items-center gap-1.5 text-xs text-green-800">
              <span className="size-1.5 rounded-full bg-green-500" /> onlayn · mijoz sifatida sinab ko&apos;ring
            </p>
          </div>
        </header>
        <BotirChat className="flex-1" businessName={name} />
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <h3 className="font-sans text-sm font-extrabold">Bu qanday ishlaydi</h3>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-tint-2 text-xs font-bold text-green-900">1</span>Mijoz shaxsiy agentiga yozadi.</li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-tint-2 text-xs font-bold text-green-900">2</span>Agentlar katalog va chegirma limiti bo&apos;yicha muzokara qiladi.</li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-tint-2 text-xs font-bold text-green-900">3</span>Mijoz taklifni tasdiqlaydi va to&apos;laydi.</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-tint-3 bg-tint-1 p-4 text-sm text-green-900">Bu sinov yangi buyurtma yaratadi: u Umumiy bo&apos;limda ko&apos;rinadi.</div>
      </aside>
    </div>
  );
}
