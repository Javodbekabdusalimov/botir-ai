"use client";

import Link from "next/link";
import { AlertCircle, Send } from "lucide-react";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { getAnalytics, getChats, getOrders } from "@/lib/api";
import { formatSom, formatWhen, shortId } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: "Qoralama", cls: "bg-muted text-muted-foreground" },
  pending_confirm: { label: "Tasdiq kutilmoqda", cls: "bg-biz/15 text-biz" },
  confirmed: { label: "Tasdiqlangan", cls: "bg-agent/15 text-agent" },
  paid: { label: "To'langan", cls: "bg-green-500/15 text-green-700" },
  cancelled: { label: "Bekor qilingan", cls: "bg-destructive/15 text-destructive" },
};

export function Overview() {
  const id = useBusinessId();
  const orders = useAsync(`orders:${id}`, () => getOrders(id));
  const chats = useAsync(`chats:${id}`, () => getChats(id));
  const stats = useAsync(`stats:${id}`, () => getAnalytics(id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Buyurtmalar" value={orders.data ? String(orders.data.length) : "..."} />
        <Stat label="Bugungi tushum" value={stats.data ? formatSom(stats.data.revenue.today) : "..."} />
        <Stat label="Oylik tushum" value={stats.data ? formatSom(stats.data.revenue.month) : "..."} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Buyurtmalar">
          {orders.loading ? (
            <Loading />
          ) : orders.error ? (
            <ErrorBox message={orders.error} onRetry={orders.reload} />
          ) : !orders.data?.length ? (
            <Empty>Hozircha buyurtma yo'q. Agent birinchi mijozni kutmoqda.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {orders.data.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">Mijoz #{shortId(o.userId)}</p>
                    <p className="truncate text-sm text-muted-foreground">{o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(o.createdAt)}{o.discountPct > 0 && ` · -${o.discountPct}%`}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatSom(o.total)}</p>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS[o.status]?.cls)}>
                      {STATUS[o.status]?.label ?? o.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Suhbatlar">
          {chats.loading ? (
            <Loading />
          ) : chats.error ? (
            <ErrorBox message={chats.error} onRetry={chats.reload} />
          ) : !chats.data?.length ? (
            <Empty>Suhbatlar yo'q. Telegramni ulang.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {chats.data.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link href="/dashboard/inbox" className="flex min-h-11 items-start gap-3 py-3">
                    {c.needsHuman ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-biz" aria-label="Egasi javobi kerak" /> : <Send className="mt-0.5 size-4 shrink-0 text-agent" aria-label="Telegram" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{c.lastMessageText}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(c.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {stats.loading ? (
        <Loading />
      ) : stats.error ? (
        <ErrorBox message={stats.error} onRetry={stats.reload} />
      ) : (
        stats.data && (
          <div className="grid gap-6 md:grid-cols-3">
            <Panel title="Eng ko'p so'ralgan">
              <Bars items={stats.data.topRequests.map((x) => ({ text: x.query, count: x.count }))} tone="bg-agent" empty="Ma'lumot yo'q" />
            </Panel>
            <Panel title="Topilmagan (katalogda yo'q)">
              <Bars items={stats.data.notFound.map((x) => ({ text: x.query, count: x.count }))} tone="bg-biz" empty="Hammasi katalogda bor" />
            </Panel>
            <Panel title="Qaytmagan mijozlar">
              {stats.data.lostCustomers.length === 0 ? (
                <Empty>Yo'qotilgan mijoz yo'q</Empty>
              ) : (
                <ul className="space-y-3 text-sm">
                  {stats.data.lostCustomers.map((l) => (
                    <li key={l.userId}>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-muted-foreground">Oxirgi buyurtma: {formatWhen(l.lastOrderAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p className="mt-1 break-words font-display text-lg font-bold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

function Bars({ items, tone, empty }: { items: { text: string; count: number }[]; tone: string; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-3 text-sm">
      {items.map((i) => (
        <li key={i.text}>
          <div className="flex justify-between gap-2">
            <span>{i.text}</span>
            {i.count > 0 && <span className="tabular-nums text-muted-foreground">{i.count}</span>}
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(8, (i.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
