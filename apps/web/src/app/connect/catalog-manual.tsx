"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cellPrice, type CatalogRow } from "@/lib/catalog-parse";
import { formatSom } from "@/lib/format";

/** Faylsiz katalog: bittalab qo'lda kiritish yoki ro'yxatni yozib/nusxalab qo'yish. */
/**
 * `onPending`: maydonlarda yozilgan, lekin "Qo'shish" bosilmagan to'g'ri qator (yoki null).
 * Forma yuborilganda u ham katalogga qo'shiladi: odam "Qo'shish" ni unutsa xato chiqmasin.
 */
export function CatalogManual({ onAdd, onParse, onPending }: { onAdd: (r: CatalogRow) => void; onParse: (text: string) => void; onPending: (r: CatalogRow | null) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [text, setText] = useState("");
  const p = cellPrice(price);
  const ok = name.trim().length > 1 && p !== null;
  useEffect(() => {
    onPending(ok && p !== null ? { name: name.trim(), price: p, unit: unit.trim() || "dona" } : null);
  }, [ok, p, name, unit, onPending]);

  function add() {
    if (!ok || p === null) return;
    onAdd({ name: name.trim(), price: p, unit: unit.trim() || "dona" });
    setName("");
    setPrice("");
    setUnit("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">Faylsiz: qo&apos;lda kiriting</p>
      <div
        className="grid gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nomi (Moy almashtirish)" aria-label="Mahsulot yoki xizmat nomi" className="h-11" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="Narx (150 000)" aria-label="Narx, so'm" className="h-11" />
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="birlik" aria-label="Birlik" className="h-11" />
        <Button type="button" className="h-11 px-4" disabled={!ok} onClick={add}>
          <Plus className="size-4" aria-hidden="true" /> Qo&apos;shish
        </Button>
      </div>
      {price !== "" && (p === null ? <p className="text-xs text-destructive">Narxni raqam bilan yozing: 150 000</p> : <p className="text-xs text-muted-foreground">{formatSom(p)}</p>)}
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Yoki ro&apos;yxatni bir yo&apos;la yozing / Excel&apos;dan nusxa qo&apos;ying</summary>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          aria-label="Ro'yxat: har qatorda nomi va narxi"
          placeholder={"Moy almashtirish 150 000\nRazval 120 000\nBalansirovka 80 000"}
          className="mt-2 text-base sm:text-sm"
        />
        <Button type="button" variant="outline" className="mt-2 h-10 px-4" disabled={!text.trim()} onClick={() => onParse(text)}>
          Ro&apos;yxatni qo&apos;shish
        </Button>
      </details>
    </div>
  );
}
