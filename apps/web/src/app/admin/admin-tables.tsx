"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { getAdminClients, getAdminPayments } from "@/lib/api";
import { formatSom, formatWhen } from "@/lib/format";
import type { AdminClient, AdminPayment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLive } from "./use-live";

const LIMIT = 100;
const when = (iso: string | null) => (iso ? formatWhen(iso) : "—");
const num = (n: number) => n.toLocaleString("ru-RU").replace(/\s/g, " ");

/** Qidiruv maydoni: 300 ms kutib so'rov yuboradi. */
function useSearch(): [string, string, (v: string) => void] {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  return [q, debounced, setQ];
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:min-w-56">
      Qidiruv
      <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground" />
    </label>
  );
}

/** Jadval faqat o'z konteyneri ichida suriladi (390 px da sahifa gorizontal surilmaydi). */
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => <td className={cn("whitespace-nowrap px-3 py-2 align-top", className)}>{children}</td>;

function Pill({ children, tone }: { children: React.ReactNode; tone: "test" | "paid" | "muted" | "plan" }) {
  const tones = { test: "bg-amber-100 text-amber-900 ring-amber-300", paid: "bg-green-100 text-green-900 ring-green-300", muted: "bg-muted text-muted-foreground ring-border", plan: "bg-primary text-white ring-primary" };
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1", tones[tone])}>{children}</span>;
}

function Total({ shown, total }: { shown: number; total: number }) {
  return <p className="mt-2 text-xs text-muted-foreground">{total > shown ? `${num(total)} tadan ${shown} tasi ko'rsatildi` : `Jami: ${num(total)}`}</p>;
}

export function ClientsTable({ tick }: { tick: number }) {
  const [q, dq, setQ] = useSearch();
  const [plan, setPlan] = useState("");
  const r = useLive(`clients|${dq}|${plan}`, () => getAdminClients({ q: dq, plan, limit: LIMIT }), tick);
  return (
    <Panel title="Mijozlar">
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Ism yoki telefon" />
        <Filter label="Tarif" value={plan} onChange={setPlan} options={[["", "Hammasi"], ["pro", "Pro"], ["max", "Max"], ["free", "Free"]]} />
      </div>
      {r.error != null && <div className="mt-3"><ErrorBox message={r.error instanceof Error ? r.error.message : "Yuklab bo'lmadi"} /></div>}
      {!r.data ? (!r.error && <div className="mt-4"><Loading /></div>) : r.data.rows.length === 0 ? (
        <div className="mt-4"><Empty>{dq || plan ? "Mos mijoz topilmadi" : "Hali mijoz yo'q"}</Empty></div>
      ) : (
        <>
          <Table head={["Mijoz", "Tarif", "Boshlangan", "Tugaydi", "1-oy", "To'langan", "To'lovlar", "Oxirgi to'lov", "Token bugun", "Token 30 kun", "AI $ 30 kun", "Muzokara 30 kun", "Oxirgi faollik"]}>
            {r.data.rows.map((c) => <ClientRow key={`${c.ownerType}:${c.ownerId}`} c={c} />)}
          </Table>
          <Total shown={r.data.rows.length} total={r.data.total} />
        </>
      )}
    </Panel>
  );
}

function ClientRow({ c }: { c: AdminClient }) {
  return (
    <tr>
      <Td>
        <p className="font-medium">{c.name}</p>
        <p className="text-xs text-muted-foreground">{c.ownerType === "business" ? "Biznes · " : ""}{c.phone ?? "—"}</p>
      </Td>
      <Td>{c.active ? <Pill tone="plan">{c.plan === "max" ? "Max" : "Pro"}</Pill> : <Pill tone="muted">{c.expiresAt ? "Free (tugagan)" : "Free"}</Pill>}</Td>
      <Td>{when(c.planStartedAt)}</Td>
      <Td>{when(c.expiresAt)}</Td>
      <Td>{c.introUsed ? "ishlatilgan" : "bor"}</Td>
      <Td className="tabular-nums">{c.totalPaid ? formatSom(c.totalPaid) : "—"}</Td>
      <Td className="tabular-nums">{c.paymentsCount}</Td>
      <Td>{when(c.lastPaymentAt)}</Td>
      <Td className="tabular-nums">{num(c.tokensToday)}</Td>
      <Td className="tabular-nums">{num(c.tokens30d)}</Td>
      <Td className="tabular-nums">${c.aiCostUsd30d.toFixed(2)}</Td>
      <Td className="tabular-nums">{c.negotiations30d}</Td>
      <Td>{when(c.lastActivityAt)}</Td>
    </tr>
  );
}

export function PaymentsTable({ tick }: { tick: number }) {
  const [q, dq, setQ] = useSearch();
  const [test, setTest] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const r = useLive(`payments|${dq}|${test}|${status}|${kind}`, () => getAdminPayments({ q: dq, test, status, kind, limit: LIMIT }), tick);
  const filtered = Boolean(dq || test || status || kind);
  return (
    <Panel title="To'lovlar">
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Ism, telefon, biznes, ID" />
        <Filter label="Pul" value={test} onChange={setTest} options={[["", "Hammasi"], ["real", "Haqiqiy"], ["test", "TEST"]]} />
        <Filter label="Holat" value={status} onChange={setStatus} options={[["", "Hammasi"], ["paid", "To'langan"], ["pending", "Kutilmoqda"], ["failed", "Amalga oshmadi"], ["expired", "Muddati o'tgan"]]} />
        <Filter label="Turi" value={kind} onChange={setKind} options={[["", "Hammasi"], ["subscription", "Obuna"], ["order", "Buyurtma"]]} />
      </div>
      {r.error != null && <div className="mt-3"><ErrorBox message={r.error instanceof Error ? r.error.message : "Yuklab bo'lmadi"} /></div>}
      {!r.data ? (!r.error && <div className="mt-4"><Loading /></div>) : r.data.rows.length === 0 ? (
        <div className="mt-4"><Empty>{filtered ? "Mos to'lov topilmadi" : "Hali to'lov yo'q"}</Empty></div>
      ) : (
        <>
          <Table head={["Yaratilgan", "Turi", "Summa", "Holat", "Pul", "To'lovchi", "Biznes", "To'langan", "ID"]}>
            {r.data.rows.map((p) => <PaymentRow key={p.id} p={p} />)}
          </Table>
          <Total shown={r.data.rows.length} total={r.data.total} />
        </>
      )}
    </Panel>
  );
}

const STATUS: Record<string, string> = { paid: "To'langan", pending: "Kutilmoqda", failed: "Amalga oshmadi", expired: "Muddati o'tgan" };

function PaymentRow({ p }: { p: AdminPayment }) {
  return (
    <tr className={cn(p.isTest && "bg-amber-50/60")}>
      <Td>{when(p.createdAt)}</Td>
      <Td>{p.kind === "subscription" ? `Obuna${p.plan ? ` · ${p.plan === "max" ? "Max" : "Pro"}` : ""}` : "Buyurtma"}</Td>
      <Td className="tabular-nums font-medium">{formatSom(p.amount)}</Td>
      <Td>{p.status === "paid" ? <Pill tone="paid">{STATUS.paid}</Pill> : <Pill tone="muted">{STATUS[p.status] ?? p.status}</Pill>}</Td>
      <Td>{p.isTest ? <Pill tone="test">TEST</Pill> : "Haqiqiy"}</Td>
      <Td>
        <p>{p.payer?.name ?? (p.payer ? "Mehmon" : "—")}</p>
        <p className="text-xs text-muted-foreground">{p.payer?.phone ?? ""}</p>
      </Td>
      <Td>
        <p>{p.business?.name ?? "—"}</p>
        {p.orderTotal != null && <p className="text-xs text-muted-foreground">buyurtma {formatSom(p.orderTotal)}</p>}
      </Td>
      <Td>{when(p.paidAt)}</Td>
      <Td className="font-mono text-xs text-muted-foreground">
        <p>{p.orderId.slice(0, 18)}</p>
        <p>{p.billId.slice(0, 18)}</p>
      </Td>
    </tr>
  );
}
