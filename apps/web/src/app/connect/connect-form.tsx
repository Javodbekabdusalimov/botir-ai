"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass, selectClass } from "@/components/field";
import { createBusiness, importCatalog } from "@/lib/api";
import { parseCatalogFile, SAMPLE_CSV, type CatalogRow } from "@/lib/catalog-parse";
import { CATEGORY_LABEL, formatSom } from "@/lib/format";
import { SAMPLE_CATALOG } from "@/lib/mock";
import type { Business, BusinessCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Errors = Partial<Record<"name" | "district" | "address" | "catalog" | "form", string>>;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function ConnectForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("restaurant");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState("09:00");
  const [close, setClose] = useState("22:00");
  const [discount, setDiscount] = useState(10);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ready, setReady] = useState<Business | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setParsing(true);
    setErrors((e) => ({ ...e, catalog: undefined }));
    try {
      const parsed = await parseCatalogFile(f);
      if (!parsed.length) throw new Error("Mahsulot topilmadi. Ustunlar: nomi, narx, birlik");
      setRows(parsed);
      setFile(f);
      setFileName(f.name);
    } catch (err) {
      setRows([]);
      setFile(null);
      setFileName("");
      setErrors((e) => ({ ...e, catalog: err instanceof Error ? err.message : "Faylni o'qib bo'lmadi" }));
    } finally {
      setParsing(false);
    }
  }

  function loadSampleCatalog() {
    setRows(SAMPLE_CATALOG);
    setFile(null);
    setFileName("namuna katalog");
    setErrors((e) => ({ ...e, catalog: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Errors = {};
    if (name.trim().length < 2) next.name = "Biznes nomini kiriting";
    if (district.trim().length < 2) next.district = "Tumanni kiriting";
    if (address.trim().length < 2) next.address = "Manzilni kiriting";
    if (!rows.length) next.catalog = "Katalog faylini yuklang (yoki namuna katalogni tanlang)";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const biz = await createBusiness({
        name: name.trim(),
        category,
        district: district.trim(),
        address: address.trim(),
        workHours: Object.fromEntries(DAYS.map((d) => [d, [open, close]])) as Business["workHours"],
        maxDiscountPct: discount,
        lang: "uz",
      });
      await importCatalog(biz.id, file, rows);
      try {
        localStorage.setItem("botir.businessId", biz.id);
      } catch {}
      setReady(biz);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Ulab bo'lmadi, qayta urinib ko'ring" });
    } finally {
      setBusy(false);
    }
  }

  if (ready) return <AgentReady business={ready} count={rows.length} />;

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-8">
      <fieldset className="space-y-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        <legend className="px-2 font-display text-lg font-bold">1. Biznes haqida</legend>
        <Field id="name" label="Biznes nomi" error={errors.name}>
          <Input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} placeholder="Masalan: Chilonzor Osh Markazi" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="category" label="Kategoriya">
            <select id="category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory)}>
              {(["restaurant", "shop", "autoservice", "clinic", "beauty", "other"] as const).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="district" label="Tuman" error={errors.district}>
            <Input id="district" className={inputClass} value={district} onChange={(e) => setDistrict(e.target.value)} aria-invalid={!!errors.district} aria-describedby={errors.district ? "district-err" : undefined} placeholder="Chilonzor" />
          </Field>
        </div>
        <Field id="address" label="Manzil" error={errors.address}>
          <Input id="address" className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" aria-invalid={!!errors.address} aria-describedby={errors.address ? "address-err" : undefined} placeholder="9-kvartal, 12-uy" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="open" label="Ish vaqti">
            <div className="flex items-center gap-2">
              <Input id="open" type="time" className={inputClass} value={open} onChange={(e) => setOpen(e.target.value)} aria-label="Ochilish vaqti" />
              <span aria-hidden="true">-</span>
              <Input id="close" type="time" className={inputClass} value={close} onChange={(e) => setClose(e.target.value)} aria-label="Yopilish vaqti" />
            </div>
          </Field>
          <Field id="discount" label={`Maksimal chegirma: ${discount}%`} hint="Agent bu chegaradan oshib chegirma bera olmaydi.">
            <input id="discount" type="range" min={0} max={30} step={1} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="h-11 w-full accent-[var(--biz)]" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        <legend className="px-2 font-display text-lg font-bold">2. Katalog</legend>
        <p className="text-sm text-muted-foreground">Excel (.xlsx) yoki CSV: ustunlar <code>nomi, narx, birlik</code>.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input ref={fileRef} id="catalog" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            Fayl tanlash
          </Button>
          <Button type="button" variant="ghost" className="h-11 px-4" onClick={loadSampleCatalog}>
            <FileSpreadsheet className="size-4" aria-hidden="true" /> Namuna katalog
          </Button>
          <a download="katalog-namuna.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4")}>
            CSV shablon
          </a>
        </div>
        {errors.catalog && (
          <p role="alert" className="text-sm text-destructive">
            {errors.catalog}
          </p>
        )}
        {rows.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-agent">
              {fileName}: {rows.length} ta mahsulot
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">Katalog ko'rinishi</caption>
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nomi</th>
                    <th className="px-3 py-2 font-medium">Narx</th>
                    <th className="px-3 py-2 font-medium">Birlik</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={`${r.name}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 tabular-nums">{formatSom(r.price)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 8 && <p className="mt-2 text-xs text-muted-foreground">Yana {rows.length - 8} ta mahsulot...</p>}
          </div>
        )}
      </fieldset>

      {errors.form && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {errors.form}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 w-full text-base sm:w-auto sm:px-8" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {busy ? "Agent yaratilmoqda..." : "Agentni yaratish"}
      </Button>
    </form>
  );
}

function AgentReady({ business, count }: { business: Business; count: number }) {
  return (
    <div className="rise-in mt-8 rounded-2xl border border-agent/40 bg-agent/10 p-5">
      <p className="flex items-center gap-2 font-display text-xl font-bold text-agent">
        <CheckCircle2 className="size-6" aria-hidden="true" /> Agent tayyor
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {business.name}: {count} ta mahsulot yuklandi, maksimal chegirma {business.maxDiscountPct}%.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link href="/dashboard" className={cn(buttonVariants(), "h-11 px-4")}>
          Panelga o'tish
        </Link>
        <Link href="/connect/telegram" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
          Telegramni ulash
        </Link>
      </div>
    </div>
  );
}
