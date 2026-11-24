"use client";

import Link from "next/link";
import { AlertCircle, Bot, Receipt, Send, TrendingUp, Wallet } from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import { getAnalytics, getChats, getOrders } from "@/lib/api";
import { formatSom, formatWhen, shortId } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: "Qoralama", cls: "bg-muted text-muted-foreground" },
  pending_confirm: { label: "Tasdiq kutilmoqda", cls: "bg-biz-soft text-biz" },
  confirmed: { label: "Tasdiqlangan", cls: "bg-tint-2 text-green-900" },
  paid: { label: "To'langan", cls: "bg-green-600 text-white" },
  cancelled: { label: "Bekor qilingan", cls: "bg-destructive/15 text-destructive" },
};

export function Overview() {
  const id = useBusinessId();
  const orders = useAsync(`orders:${id}`, () => getOrders(id));
  const chats = useAsync(`chats:${id}`, () => getChats(id));
  const stats = useAsync(`stats:${id}`, () => getAnalytics(id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Receipt} label="Bugungi buyurtmalar" value={orders.data?.length} />
        <Stat icon={Wallet} label="Bugungi tushum" value={stats.data?.revenue.today} money />
        <Stat icon={TrendingUp} label="O'rtacha chek" value={orders.data?.length ? Math.round(orders.data.reduce((s, o) => s + o.total, 0) / orders.data.length) : orders.data ? 0 : undefined} money />
        <Stat icon={Bot} label="AI javob bergan" value={chats.data?.length ? Math.round((chats.data.filter((c) => !c.needsHuman).length / chats.data.length) * 100) : chats.data ? 0 : undefined} suffix="%" />
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
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Mijoz</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Buyurtma</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Summa</th>
                    <th scope="col" className="py-2 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.data.map((o) => (
                    <tr key={o.id} className="align-top transition-colors hover:bg-tint-1/60">
                      <td className="py-3 pr-3">
                        <p className="font-medium">#{shortId(o.userId)}</p>
                        <p className="text-xs text-muted-foreground">{formatWhen(o.createdAt)}</p>
                      </td>
                      <td className="max-w-48 py-3 pr-3 text-muted-foreground">
                        <span className="line-clamp-2">{o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</span>
                        {o.discountPct > 0 && <span className="text-xs text-green-700"> -{o.discountPct}%</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums">{formatSom(o.total)}</td>
                      <td className="py-3">
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", STATUS[o.status]?.cls)}>{STATUS[o.status]?.label ?? o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <Panel title="Ko'p so'ralgan">
              <Bars items={stats.data.topRequests.map((x) => ({ text: x.query, count: x.count }))} tone="bg-agent" empty="Ma'lumot yo'q" />
            </Panel>
            <Panel title="Topilmadi (katalogda yo'q)">
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

function Stat({ icon: Icon, label, value, money, suffix }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | undefined; money?: boolean; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
        <span className="grid size-8 place-items-center rounded-lg bg-tint-2 text-green-800">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {label}
      </div>
      {value === undefined ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-muted" role="status" aria-label="Yuklanmoqda" />
      ) : (
        <p className="mt-3 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">{money ? formatSom(n) : `${n}${suffix ?? ""}`}</p>
      )}
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
