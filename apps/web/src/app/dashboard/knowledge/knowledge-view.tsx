"use client";

import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, FileUp, KeyRound, Link2, Loader2, Mic, MicOff, Pencil, Send, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ErrorBox, Loading, Panel } from "@/components/states";
import { useAsync } from "@/hooks/use-async";
import { useBusinessId } from "@/hooks/use-business";
import {
  addKnowledgeFile, addKnowledgeTelegram, addKnowledgeText, addKnowledgeUrl, answerQuestion, confirmFacts,
  createSyncKey, dismissQuestion, getChats, getKnowledge, patchFact,
} from "@/lib/api";
import { formatSom } from "@/lib/format";
import type { KnowledgeFact, KnowledgeOverview, KnowledgeSourceKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const TOPIC: Record<string, string> = {
  profile: "Biznes haqida", catalog: "Katalog", delivery: "Yetkazib berish", payment: "To'lov", booking: "Bron",
  hours: "Ish vaqti", location: "Manzil", policy: "Qoidalar", faq: "Savol-javob", style: "Uslub", contact: "Aloqa",
};
const SOURCE: Record<KnowledgeSourceKind, string> = {
  photo: "Rasm", pdf: "PDF", text: "Matn", telegram: "Telegram", website: "Sayt", voice: "Ovoz", sync: "Sinxron", question: "Savol javobi",
};
const topic = (t: string) => TOPIC[t] ?? t;
const POLL_MS = 3000;

type Tab = "text" | "url" | "file" | "telegram";

export function KnowledgeView() {
  const id = useBusinessId();
  const kb = useAsync(`kb:${id}`, () => getKnowledge(id));
  // Yangilangan nusxa (polling / amaldan keyin) birinchi yuklanganidan ustun.
  const [live, setLive] = useState<{ id: string; d: KnowledgeOverview } | null>(null);
  const data = (live?.id === id ? live.d : kb.data) ?? null;
  const setData = (d: KnowledgeOverview) => setLive({ id, d });
  const [err, setErr] = useState<string | null>(null);

  // Manba "processing" bo'lsa: tayyor bo'lguncha har 3 s yangilaymiz.
  const processing = data?.sources.some((s) => s.status === "processing") ?? false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => {
      getKnowledge(id).then((d) => setLive({ id, d })).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [processing, id]);

  const refresh = () => getKnowledge(id).then(setData).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Yuklab bo'lmadi"));
  /** true = server qabul qildi (forma shundagina tozalanadi). */
  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setErr(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik yuz berdi");
      return false;
    }
  };

  if (kb.loading && !data) return <Loading />;
  if (kb.error && !data) return <ErrorBox message={kb.error} onRetry={kb.reload} />;
  if (!data) return null;

  const drafts = data.facts.filter((f) => f.status === "draft");
  const confirmed = data.facts.filter((f) => f.status === "confirmed");
  const open = data.questions.filter((q) => q.status === "open");

  return (
    <div className="space-y-6">
      <Metrics data={data} />
      {err && <ErrorBox message={err} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AddSource businessId={id} onAdded={(fn) => act(fn)} />
        <Panel title="Manbalar">
          {!data.sources.length ? (
            <Empty>Hali manba yo&apos;q. Menyu, narxlar yoki ish vaqtini yozing — AI faktlarga ajratadi.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                  <span className="rounded-md bg-tint-1 px-2 py-0.5 text-xs font-semibold text-green-900">{SOURCE[s.kind] ?? s.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.status === "processing" ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> O&apos;qilmoqda
                    </span>
                  ) : s.status === "failed" ? (
                    <span className="min-w-0 max-w-[60%] text-xs text-destructive">Xato{s.error ? `: ${friendlyError(s.error)}` : ""}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{s.factsCount} fakt</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={`Tasdiqlash kerak (${drafts.length})`}>
        <DraftFacts businessId={id} facts={drafts} act={act} />
      </Panel>

      <Panel title={`Ochiq savollar (${open.length})`}>
        {!open.length ? (
          <Empty>Agent bilmagan savol yo&apos;q. Mijoz noma&apos;lum narsa so&apos;rasa, agent to&apos;qimaydi — savol shu yerga keladi.</Empty>
        ) : (
          <ul className="space-y-3">
            {open.map((q) => (
              <QuestionRow key={q.id} q={q} onAnswer={(a) => act(() => answerQuestion(id, q.id, a))} onDismiss={() => act(() => dismissQuestion(id, q.id))} />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Agent biladi (${confirmed.length})`}>
          {!confirmed.length ? (
            <Empty>Tasdiqlangan fakt yo&apos;q. Agent faqat siz tasdiqlagan faktlarni ishlatadi.</Empty>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
              {confirmed.map((f) => (
                <li key={f.id} className="flex gap-2 rounded-lg px-2 py-1.5 hover:bg-tint-1/60">
                  <Check className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-xs font-semibold text-muted-foreground">{topic(f.topic)} · </span>
                    {f.question && <span className="font-medium">{f.question} — </span>}
                    {f.content}
                    {f.price != null && <span className="font-semibold"> · {formatSom(f.price)}{f.unit ? ` / ${f.unit}` : ""}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <SyncKey businessId={id} />
      </div>
    </div>
  );
}

function Metrics({ data }: { data: KnowledgeOverview }) {
  const m = data.metrics;
  const ready = m.minutesToReady == null ? "—" : m.minutesToReady < 1 ? "<1 daqiqa" : `${Math.round(m.minutesToReady)} daqiqa`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric label="AI javob bergan" value={m.aiAnsweredPct == null ? "—" : `${Math.round(m.aiAnsweredPct)}%`} hint={m.aiTurns ? `${m.aiTurns} ta javob` : "Hali suhbat yo'q"} />
      <Metric label="Agent tayyor bo'ldi" value={ready} hint="Biznes ochilganidan beri" />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <p className="text-sm font-semibold text-muted-foreground">Yetishmayotgan mavzular</p>
        {m.missingTopics.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.missingTopics.map((t) => (
              <span key={t} className="rounded-md bg-biz-soft px-2 py-0.5 text-xs font-semibold text-biz">{topic(t)}</span>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-display text-lg font-bold">Hammasi bor</p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AddSource({ businessId, onAdded }: { businessId: string; onAdded: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabs: [Tab, string, typeof Type][] = [["text", "Matn", Type], ["url", "Havola", Link2], ["file", "Fayl", FileUp], ["telegram", "Telegram", Send]];

  const submit = async (fn: () => Promise<unknown>, reset?: () => void) => {
    setBusy(true);
    const ok = await onAdded(fn);
    setBusy(false);
    if (ok) reset?.();
  };

  return (
    <Panel title="Manba qo'shish">
      <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors", tab === k ? "border-green-600 bg-tint-1 text-green-900" : "border-border hover:bg-muted")}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {tab === "text" && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Masalan: To'y oshi 45 000 so'm. Har kuni 9:00–23:00. Chilonzorga yetkazish bepul." aria-label="Biznes haqida matn" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || text.trim().length < 3} onClick={() => submit(() => addKnowledgeText(businessId, text.trim(), voice ? "voice" : "text"), () => { setText(""); setVoice(false); })}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />} Faktlarga ajratish
            </Button>
            <Dictation onText={(t) => { setText((cur) => (cur ? `${cur} ${t}` : t)); setVoice(true); }} />
          </div>
        </div>
      )}

      {tab === "url" && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void submit(() => addKnowledgeUrl(businessId, url.trim()), () => setUrl("")); }}>
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sizning-sayt.uz/menyu" aria-label="Sayt havolasi" className="h-9" />
          <Button type="submit" disabled={busy || !url.trim()}>Qo&apos;shish</Button>
        </form>
      )}

      {tab === "file" && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/*"
            className="sr-only"
            aria-label="Fayl tanlash"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void submit(() => addKnowledgeFile(businessId, f), () => { if (fileRef.current) fileRef.current.value = ""; });
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" aria-hidden="true" /> Menyu rasmi, PDF yoki audio
          </Button>
          <p className="text-xs text-muted-foreground">AI o&apos;qiydi va qoralama faktlar chiqaradi. Siz tasdiqlamaguncha agent ularni ishlatmaydi.</p>
        </div>
      )}

      {tab === "telegram" && <TelegramPick businessId={businessId} busy={busy} onPick={(ids) => submit(() => addKnowledgeTelegram(businessId, ids))} />}
    </Panel>
  );
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

const noop = () => () => {};
const speechSupported = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

function Dictation({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<InstanceType<SpeechCtor> | null>(null);
  const supported = useSyncExternalStore(noop, speechSupported, () => false);
  if (!supported) return null;
  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
    const r = new Ctor();
    r.lang = "uz-UZ";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (last?.[0]?.transcript) onText(last[0].transcript.trim());
    };
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <Button variant="outline" onClick={toggle} aria-pressed={on}>
      {on ? <MicOff className="size-4 text-destructive" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />} {on ? "To'xtatish" : "Gapirib yozish"}
    </Button>
  );
}

function TelegramPick({ businessId, busy, onPick }: { businessId: string; busy: boolean; onPick: (ids: string[]) => void }) {
  const chats = useAsync(`kb-chats:${businessId}`, () => getChats(businessId));
  const [sel, setSel] = useState<string[]>([]);
  if (chats.loading) return <Loading />;
  if (chats.error) return <ErrorBox message={chats.error} onRetry={chats.reload} />;
  if (!chats.data?.length) return <Empty>Telegram ulanmagan yoki chat yo&apos;q. Avval Telegram&apos;ni ulang.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Faqat siz tanlagan chatlar o&apos;qiladi. Shaxsiy yozishmalarni tanlamang.</p>
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {chats.data.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
              <span className="truncate">{c.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button disabled={busy || !sel.length} onClick={() => { onPick(sel); setSel([]); }}>
        {sel.length ? `${sel.length} ta chatni o'qish` : "Chat tanlang"}
      </Button>
    </div>
  );
}

function DraftFacts({ businessId, facts, act }: { businessId: string; facts: KnowledgeFact[]; act: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  if (!facts.length) return <Empty>Qoralama fakt yo&apos;q. Manba qo&apos;shsangiz, AI chiqargan faktlar shu yerda tasdiqlanadi.</Empty>;
  const all = sel.length === facts.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={() => setSel(all ? [] : facts.map((f) => f.id))} /> Hammasini tanlash
        </label>
        <Button disabled={!sel.length} onClick={() => act(() => confirmFacts(businessId, sel)).then(() => setSel([]))}>
          <Check className="size-4" aria-hidden="true" /> Tasdiqlash ({sel.length})
        </Button>
      </div>
      <ul className="space-y-2">
        {facts.map((f) => (
          <li key={f.id} className={cn("rounded-xl border p-3", f.confidence < 0.5 ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20" : "border-border")}>
            {edit === f.id ? (
              <FactEditor fact={f} onCancel={() => setEdit(null)} onSave={(patch) => act(() => patchFact(businessId, f.id, patch)).then(() => setEdit(null))} />
            ) : (
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" aria-label="Tanlash" checked={sel.includes(f.id)} onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold">{topic(f.topic)}</span>
                    <span>· {SOURCE[f.sourceKind] ?? f.sourceKind}</span>
                    <span>· {Math.round(f.confidence * 100)}%</span>
                    {f.confidence < 0.5 && (
                      <span className="flex items-center gap-1 font-semibold text-amber-700">
                        <AlertTriangle className="size-3.5" aria-hidden="true" /> Tekshiring
                      </span>
                    )}
                  </div>
                  {f.question && <p className="font-medium">{f.question}</p>}
                  <p>
                    {f.content}
                    {f.price != null && <span className="font-semibold"> · {formatSom(f.price)}{f.unit ? ` / ${f.unit}` : ""}</span>}
                  </p>
                  {f.evidence && <p className="mt-1 truncate text-xs italic text-muted-foreground">“{f.evidence}”</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label="Tahrirlash" onClick={() => setEdit(f.id)}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Tasdiqlash" onClick={() => act(() => confirmFacts(businessId, [f.id]))}><Check className="size-4 text-green-700" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Rad etish" onClick={() => act(() => patchFact(businessId, f.id, { status: "rejected" }))}><X className="size-4 text-destructive" /></Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FactEditor({ fact, onSave, onCancel }: { fact: KnowledgeFact; onSave: (p: { content: string; question?: string; price?: number; unit?: string }) => void; onCancel: () => void }) {
  const [content, setContent] = useState(fact.content);
  const [question, setQuestion] = useState(fact.question ?? "");
  const [price, setPrice] = useState(fact.price != null ? String(fact.price) : "");
  const [unit, setUnit] = useState(fact.unit ?? "");
  const catalog = fact.kind === "catalog";
  const p = Number(price.replace(/\s/g, ""));
  const badPrice = catalog && price !== "" && (!Number.isFinite(p) || p < 0);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (badPrice || !content.trim()) return;
        onSave({ content: content.trim(), ...(fact.question !== undefined || question ? { question: question.trim() } : {}), ...(catalog ? { price: price === "" ? undefined : p, unit: unit.trim() || undefined } : {}) });
      }}
    >
      {(fact.kind === "faq" || fact.question) && <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Savol" aria-label="Savol" />}
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} aria-label="Fakt matni" />
      {catalog && (
        <div className="flex gap-2">
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Narx, so'm" aria-label="Narx" aria-invalid={badPrice} />
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="birlik (porsiya, kg)" aria-label="Birlik" />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={badPrice || !content.trim()}>Saqlash</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Bekor</Button>
      </div>
    </form>
  );
}

function QuestionRow({ q, onAnswer, onDismiss }: { q: { question: string; timesAsked: number }; onAnswer: (a: string) => Promise<boolean>; onDismiss: () => void }) {
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="rounded-xl border border-border p-3">
      <p className="text-sm font-medium">
        {q.question} <span className="text-xs font-normal text-muted-foreground">· {q.timesAsked} marta so&apos;raldi</span>
      </p>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!a.trim()) return; setBusy(true); await onAnswer(a.trim()); setBusy(false); }}>
        <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Javobingiz — FAQ bo'lib saqlanadi" aria-label="Javob" className="h-9" />
        <Button type="submit" disabled={busy || !a.trim()}>Javob</Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>Kerak emas</Button>
      </form>
    </li>
  );
}

function SyncKey({ businessId }: { businessId: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Panel title="Kassa / 1C sinxron">
      <p className="mb-3 text-sm text-muted-foreground">iiko, 1C yoki o&apos;z skriptingiz <code className="rounded bg-muted px-1">POST /sync/catalog</code> ga narx va qoldiqni yuborsin. Kalit faqat bir marta ko&apos;rsatiladi.</p>
      {key ? (
        <div className="space-y-2">
          <code className="block break-all rounded-lg bg-muted p-2 text-xs">{key}</code>
          <Button variant="outline" onClick={() => navigator.clipboard?.writeText(key)}>Nusxa olish</Button>
          <p className="text-xs font-semibold text-amber-700">Hozir saqlab qo&apos;ying: sahifadan chiqsangiz qayta ko&apos;rinmaydi.</p>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              setKey((await createSyncKey(businessId)).key);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Xatolik");
            } finally {
              setBusy(false);
            }
          }}
        >
          <KeyRound className="size-4" aria-hidden="true" /> Kalit yaratish
        </Button>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </Panel>
  );
}
