"use client";

import { MessageCircle, Send } from "lucide-react";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { getAnalytics, getConversations, getOrders } from "@/lib/api";
import { formatSom, formatWhen } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  new: { label: "Yangi", cls: "bg-biz/15 text-biz" },
  confirmed: { label: "Tasdiqlangan", cls: "bg-agent/15 text-agent" },
  paid: { label: "To'langan", cls: "bg-emerald-400/15 text-emerald-300" },
  done: { label: "Bajarilgan", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Bekor qilingan", cls: "bg-destructive/15 text-destructive" },
};

export function Overview() {
  const id = useBusinessId();
  const orders = useAsync(`orders:${id}`, () => getOrders(id));
  const convs = useAsync(`convs:${id}`, () => getConversations(id));
  const stats = useAsync(`stats:${id}`, () => getAnalytics(id));

  const revenue = (orders.data ?? []).filter((o) => o.status !== "cancelled" && o.status !== "new").reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Buyurtmalar" value={orders.data ? String(orders.data.length) : "..."} />
        <Stat label="Tushum" value={orders.data ? formatSom(revenue) : "..."} />
        <Stat label="Suhbatlar" value={convs.data ? String(convs.data.length) : "..."} />
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
                    <p className="font-medium">{o.customer}</p>
                    <p className="truncate text-sm text-muted-foreground">{o.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(o.createdAt)}</p>
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
          {convs.loading ? (
            <Loading />
          ) : convs.error ? (
            <ErrorBox message={convs.error} onRetry={convs.reload} />
          ) : !convs.data?.length ? (
            <Empty>Suhbatlar yo'q.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {convs.data.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  {c.channel === "telegram" ? <Send className="mt-0.5 size-4 shrink-0 text-agent" aria-label="Telegram" /> : <MessageCircle className="mt-0.5 size-4 shrink-0 text-biz" aria-label="Veb" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.customer}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.lastMessage}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(c.at)}</span>
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
              <Bars items={stats.data.topAsked} tone="bg-agent" empty="Ma'lumot yo'q" />
            </Panel>
            <Panel title="Topilmagan (katalogda yo'q)">
              <Bars items={stats.data.missing} tone="bg-biz" empty="Hammasi katalogda bor" />
            </Panel>
            <Panel title="Qaytmagan mijozlar">
              {stats.data.lostClients.length === 0 ? (
                <Empty>Yo'qotilgan mijoz yo'q</Empty>
              ) : (
                <ul className="space-y-3 text-sm">
                  {stats.data.lostClients.map((l, i) => (
                    <li key={i}>
                      <p className="font-medium">{l.name}</p>
                      {l.reason && <p className="text-muted-foreground">{l.reason}</p>}
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
    <div className="rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
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
