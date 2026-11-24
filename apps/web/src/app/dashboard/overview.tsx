"use client";

import Link from "next/link";
import { AlertCircle, Bot, Inbox, MessagesSquare, Receipt, SearchX, Send, Sparkles, Wand2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logos";
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
        <Stat icon={Receipt} tone="green" label="Botir orqali buyurtmalar" value={orders.data?.length} hint={orders.data ? `${orders.data.filter((o) => o.status === "paid" || o.status === "confirmed").length} ta tasdiqlangan` : undefined} />
        <Stat icon={MessagesSquare} tone="amber" label="AI muzokaralar" value={stats.data ? stats.data.topRequests.reduce((s, r) => s + r.count, 0) : undefined} hint={stats.data ? `${stats.data.topRequests.length} xil so'rov` : undefined} />
        <Stat icon={SearchX} tone="blue" label="Topilmagan so'rovlar" value={stats.data?.notFound.length} hint={stats.data ? (stats.data.notFound.length ? "Katalogga qo'shish mumkin" : "Hammasi katalogda bor") : undefined} />
        <Stat icon={Bot} tone="violet" label="AI javob bergan" value={chats.data?.length ? Math.round((chats.data.filter((c) => !c.needsHuman).length / chats.data.length) * 100) : chats.data ? 0 : undefined} suffix="%" hint={chats.data ? `${chats.data.length} ta suhbat` : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          [Sparkles, "Agentni sinash", "/dashboard/chat"],
          [Inbox, "Inbox", "/dashboard/inbox"],
          [Send, "Telegram ulash", "/connect/telegram"],
          [Wand2, "Agentni yaxshilash", "/dashboard/improve"],
        ].map(([I, t, h]) => {
          const Icon = I as typeof Sparkles;
          return (
            <Link key={h as string} href={h as string} className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold shadow-sm transition-colors hover:border-tint-3 hover:bg-tint-1">
              <Icon className="size-4 text-green-700" aria-hidden="true" /> {t as string}
            </Link>
          );
        })}
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
                        <div className="flex items-center gap-2.5">
                          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold", AV[hash(o.userId) % AV.length])}>{o.userId.slice(0, 2).toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold" title={o.userId}>{o.userId.length > 14 ? `Mijoz #${shortId(o.userId)}` : o.userId}</p>
                            <p className="text-xs text-muted-foreground">{formatWhen(o.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-48 py-3 pr-3 text-muted-foreground">
                        <span className="line-clamp-2">{o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</span>
                        {o.discountPct > 0 && <span className="text-xs text-green-700"> -{o.discountPct}%</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums">{formatSom(o.total)}</td>
                      <td className="py-3">
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", STATUS[o.status]?.cls)}>{STATUS[o.status]?.label ?? o.status}</span>
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
                    <span className="relative shrink-0">
                      <span className={cn("grid size-10 place-items-center rounded-full text-sm font-bold", AV[hash(c.title) % AV.length])}>{c.title.slice(0, 1).toUpperCase()}</span>
                      <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white ring-1 ring-border"><BrandLogo brand="telegram" height={12} /></span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">{c.title}{c.needsHuman && <AlertCircle className="size-3.5 text-biz" aria-label="Egasi javobi kerak" />}</p>
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

const AV = ["bg-green-100 text-green-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800"];
const hash = (t: string) => [...t].reduce((a, c) => a + c.charCodeAt(0), 0);
const TONES = { green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-700", blue: "bg-sky-100 text-sky-700", violet: "bg-violet-100 text-violet-700" } as const;
const STROKE = { green: "#16a34a", amber: "#d97706", blue: "#0284c7", violet: "#7c3aed" } as const;

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data), min = Math.min(...data), r = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${28 - ((d - min) / r) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-20" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ icon: Icon, label, value, money, suffix, tone, hint, spark }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | undefined; money?: boolean; suffix?: string; tone: keyof typeof TONES; hint?: string; spark?: number[] }) {
  const n = useCountUp(value);
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONES[tone])}>
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        {value === undefined ? (
          <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" role="status" aria-label="Yuklanmoqda" />
        ) : (
          <p className="min-w-0 break-words font-display text-lg font-bold tabular-nums sm:text-xl xl:text-[22px]">{money ? formatSom(n) : `${n}${suffix ?? ""}`}</p>
        )}
        {spark && <Spark data={spark} color={STROKE[tone]} />}
      </div>
      {hint && <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{hint}</p>}
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
