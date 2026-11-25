"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/states";
import { patchFact } from "@/lib/api";
import { formatSom } from "@/lib/format";
import type { KnowledgeFact } from "@/lib/types";
import { FactEditor } from "./fact-editor";

/** "Agent biladi": tasdiqlangan faktlar. Tahrirlash (agentda darhol yangilanadi) va olib tashlash (katalogdan ham). */
export function ConfirmedFacts({
  businessId, facts, topic, act,
}: { businessId: string; facts: KnowledgeFact[]; topic: (t: string) => string; act: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    if (await act(() => patchFact(businessId, id, { status: "rejected" }))) setAsk(null);
    setBusy(null);
  }

  if (!facts.length) return <Empty>Tasdiqlangan fakt yo&apos;q. Agent faqat siz tasdiqlagan faktlarni ishlatadi.</Empty>;
  return (
    <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
      {facts.map((f) => (
        <li key={f.id} className="rounded-lg px-2 py-1.5 hover:bg-tint-1/60">
          {edit === f.id ? (
            <FactEditor fact={f} onCancel={() => setEdit(null)} onSave={(patch) => void act(() => patchFact(businessId, f.id, patch)).then((ok) => ok && setEdit(null))} />
          ) : (
            <div className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-muted-foreground">{topic(f.topic)} · </span>
                {f.question && <span className="font-medium">{f.question} — </span>}
                {f.content}
                {f.price != null && <span className="font-semibold"> · {formatSom(f.price)}{f.unit ? ` / ${f.unit}` : ""}</span>}
                {ask === f.id && (
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-destructive">{f.kind === "catalog" ? "Katalogdan ham o'chadi. Olib tashlaymizmi?" : "Agent buni endi ishlatmaydi. Olib tashlaymizmi?"}</span>
                    <Button size="sm" variant="destructive" className="h-7 px-2.5" disabled={busy === f.id} onClick={() => void remove(f.id)}>
                      {busy === f.id && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />} Ha, olib tashlash
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2.5" onClick={() => setAsk(null)}>Yo&apos;q</Button>
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-0.5">
                <Button size="icon" variant="ghost" className="size-8" aria-label="Tahrirlash" onClick={() => setEdit(f.id)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Olib tashlash" onClick={() => setAsk(f.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
