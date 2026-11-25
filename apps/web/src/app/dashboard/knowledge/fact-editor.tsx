"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatSom } from "@/lib/format";
import { parsePrice, pricesIn } from "@/lib/price-parse";
import type { KnowledgeFact } from "@/lib/types";

export interface FactPatch {
  content: string;
  question?: string;
  price?: number;
  unit?: string;
}

/**
 * Faktni tahrirlash. Narx: "45.000" = 45 000 so'm. Dalildagi raqamdan farq qilsa ogohlantiradi; 0 so'm faqat tasdiq bilan.
 */
export function FactEditor({ fact, onSave, onCancel }: { fact: KnowledgeFact; onSave: (p: FactPatch) => void; onCancel: () => void }) {
  const [content, setContent] = useState(fact.content);
  const [question, setQuestion] = useState(fact.question ?? "");
  const [price, setPrice] = useState(fact.price != null ? String(fact.price) : "");
  const [unit, setUnit] = useState(fact.unit ?? "");
  const [zeroOk, setZeroOk] = useState(false);
  const catalog = fact.kind === "catalog";
  const p = parsePrice(price);
  const badPrice = catalog && (p === null || p < 0);
  const quoted = fact.evidence ? pricesIn(fact.evidence) : [];
  const mismatch = catalog && p !== null && p > 0 && quoted.length > 0 && !quoted.includes(p);
  const needZero = catalog && p === 0 && !zeroOk;
  const blocked = badPrice || needZero || !content.trim();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        onSave({
          content: content.trim(),
          ...(fact.question !== undefined || question ? { question: question.trim() } : {}),
          ...(catalog && p !== null ? { price: p, unit: unit.trim() || undefined } : {}),
        });
      }}
    >
      {(fact.kind === "faq" || fact.question) && <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Savol" aria-label="Savol" />}
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} aria-label="Fakt matni" />
      {catalog && (
        <>
          <div className="flex gap-2">
            <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Narx, so'm (45 000)" aria-label="Narx" aria-invalid={badPrice} />
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="birlik (porsiya, kg)" aria-label="Birlik" />
          </div>
          {badPrice && price !== "" && <p className="text-xs text-destructive">Narxni raqam bilan yozing: 45 000 yoki 45.000</p>}
          {p !== null && p > 0 && <p className="text-xs text-muted-foreground">Saqlanadi: {formatSom(p)}</p>}
          {mismatch && (
            <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> Manbada boshqa narx: {quoted.map(formatSom).join(", ")}. Tekshiring.
            </p>
          )}
          {p === 0 && (
            <label className="flex items-center gap-2 text-xs text-amber-800">
              <input type="checkbox" checked={zeroOk} onChange={(e) => setZeroOk(e.target.checked)} /> Ha, bu bepul (0 so&apos;m)
            </label>
          )}
        </>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={blocked}>Saqlash</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Bekor</Button>
      </div>
    </form>
  );
}
