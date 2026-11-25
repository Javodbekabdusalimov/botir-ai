"use client";

import { track } from "@/lib/track";
import type React from "react";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, inputClass, selectClass } from "@/components/field";
import { createBusiness, importCatalog } from "@/lib/api";
import { parseCatalogFile, SAMPLE_CSV, type CatalogRow } from "@/lib/catalog-parse";
import { CATEGORY_LABEL, formatSom } from "@/lib/format";
import { SAMPLE_CATALOG } from "@/lib/mock";
import type { Business, BusinessCategory, CatalogImportResult } from "@/lib/types";
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
  const [ready, setReady] = useState<{ biz: Business; result: CatalogImportResult } | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setParsing(true);
    setErrors((e) => ({ ...e, catalog: undefined }));
    try {
      const { rows: parsed, skipped: bad } = await parseCatalogFile(f);
      if (!parsed.length) throw new Error("Mahsulot topilmadi. Ustunlar: nomi, narx, birlik");
      setRows(parsed);
      setSkipped(bad);
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
    setSkipped([]);
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
      const result = await importCatalog(biz.id, file, rows);
      try {
        localStorage.setItem("botir.businessId", biz.id);
      } catch {}
      track("generate_lead", { category, items: rows.length });
      setReady({ biz, result: { ...result, errors: [...result.errors, ...skipped.map((n) => `${n}-qator: nomi yoki narxi noto'g'ri`)] } });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Ulab bo'lmadi, qayta urinib ko'ring" });
    } finally {
      setBusy(false);
    }
  }

  if (ready) return <AgentReady business={ready.biz} result={ready.result} />;

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-8">
      <fieldset className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6 [&>legend+*]:clear-both">
        <legend className="float-left mb-4 w-full font-sans text-lg font-semibold tracking-tight">1. Biznes haqida</legend>
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
            <input id="discount" type="range" min={0} max={30} step={1} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="range-green h-11 w-full" style={{ "--p": `${(discount / 30) * 100}%` } as React.CSSProperties} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6 [&>legend+*]:clear-both">
        <legend className="float-left mb-4 w-full font-sans text-lg font-semibold tracking-tight">2. Katalog</legend>
        <p className="text-sm text-muted-foreground">Excel (.xlsx) yoki CSV: ustunlar <code>nomi, narx, birlik</code>.</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:p-8",
            drag ? "border-primary bg-tint-2" : "border-tint-3 bg-tint-1/60",
          )}
        >
          <input ref={fileRef} id="catalog" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-card text-green-800 shadow-sm">
            {parsing ? <Loader2 className="size-6 animate-spin" aria-hidden="true" /> : <Upload className="size-6" aria-hidden="true" />}
          </span>
          <p className="mt-3 font-semibold">{drag ? "Faylni qo'yib yuboring" : "Faylni shu yerga tashlang"}</p>
          <p className="text-sm text-muted-foreground">.xlsx yoki .csv, 5 MB gacha</p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => fileRef.current?.click()} disabled={parsing}>
              Fayl tanlash
            </Button>
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={loadSampleCatalog}>
              <FileSpreadsheet className="size-4" aria-hidden="true" /> Namuna katalog
            </Button>
            <a download="katalog-namuna.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4")}>
              CSV shablon
            </a>
          </div>
        </div>
        {errors.catalog && (
          <p role="alert" className="text-sm text-destructive">
            {errors.catalog}
          </p>
        )}
        {rows.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-green-800">
              {fileName}: {rows.length} ta mahsulot
            </p>
            {skipped.length > 0 && (
              <p role="status" className="mb-2 flex items-start gap-2 rounded-lg bg-biz-soft px-3 py-2 text-sm text-biz">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {skipped.length} ta qator o&apos;tkazib yuboriladi (qator: {skipped.slice(0, 8).join(", ")}
                {skipped.length > 8 ? "..." : ""}): nomi yoki narxi noto&apos;g&apos;ri.
              </p>
            )}
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

function AgentReady({ business, result }: { business: Business; result: CatalogImportResult }) {
  const errs = result.errors;
  return (
    <div className="rise-in mt-8 rounded-2xl border border-green-500/40 bg-tint-1 p-5 shadow-soft sm:p-8">
      <p className="flex items-center gap-2 font-display text-2xl font-bold text-green-900">
        <CheckCircle2 className="size-7 text-green-600" aria-hidden="true" /> Agentingiz tayyor ✅
      </p>
      <p className="mt-2 text-sm text-green-900/80">
        {business.name}: maksimal chegirma {business.maxDiscountPct}%. Agent endi mijozlar bilan gaplasha oladi.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-tint-3 bg-card p-3">
          <dt className="text-muted-foreground">Qo&apos;shildi</dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-green-800">{result.imported} ta</dd>
        </div>
        <div className="rounded-xl border border-tint-3 bg-card p-3">
          <dt className="text-muted-foreground">Xato</dt>
          <dd className={cn("font-display text-2xl font-bold tabular-nums", errs.length ? "text-biz" : "text-green-800")}>{errs.length} ta</dd>
        </div>
      </dl>
      {errs.length > 0 && (
        <ul className="mt-3 list-inside list-disc rounded-xl bg-biz-soft p-3 text-sm text-biz">
          {errs.slice(0, 6).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/connect/telegram" className={cn(buttonVariants(), "h-12 px-5 font-semibold")}>
          Telegramni ulash
        </Link>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-12 px-5 font-semibold")}>
          Panelga o&apos;tish
        </Link>
      </div>
    </div>
  );
}
