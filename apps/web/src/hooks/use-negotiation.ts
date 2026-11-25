"use client";

import { useEffect, useState } from "react";
import { streamNegotiation } from "@/lib/api";
import { runMockStream } from "@/lib/mock";
import type { NegotiationEvent, NegotiationState, NegotiationStatus } from "@/lib/types";

/** "Yozmoqda..." davomiyligi: bazaviy + matn uzunligiga proporsional (yuqori chegara bilan). */
const TYPING_BASE_MS = 550;
const TYPING_PER_CHAR_MS = 5;
const TYPING_MAX_EXTRA_MS = 600;
/** Harf-harf chiqarish: har kadrda nechta belgi va kadrlar orasidagi pauza. */
const REVEAL_CHARS_PER_TICK = 3;
const REVEAL_TICK_MS = 16;
/** Xabar to'liq chiqqandan keyingi pauza (keyingi xabar oldidan). */
const MESSAGE_GAP_MS = 350;
/** `prefers-reduced-motion` da har kutish shu qiymat bilan cheklanadi. */
const REDUCED_SLEEP_CAP_MS = 40;

const INITIAL: NegotiationState = { lanes: {}, order: [], best: {}, status: "running", error: null };

/**
 * SSE (yoki mock) hodisalarini har biznes uchun alohida navbatga qo'yib, "yozmoqda..." va harf-harf
 * animatsiya bilan ketma-ket ko'rsatadi: bir necha biznes bilan muzokara parallel ketadi.
 * Yakuniy status barcha chiziqlar ko'rsatib bo'lingach qo'llanadi.
 *
 * Kontrakt: `id` yoki `forceMock` o'zgarsa oqim yopilib, holat noldan boshlanadi (unmount'da ham
 * barcha taymerlar va ulanish tozalanadi). `prefers-reduced-motion` da kutishlar qisqartiriladi.
 * Chekka holat: `rejected`/`failed` kabi yakuniy status ham navbat bo'shagandan keyingina qo'yiladi.
 */
export function useNegotiation(id: string, forceMock = false): NegotiationState {
  const [state, setState] = useState<NegotiationState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const queues = new Map<string, NegotiationEvent[]>();
    const pumping = new Set<string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let pendingStatus: NegotiationStatus | null = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(
          () => {
            timers.delete(t);
            resolve();
          },
          reduce ? Math.min(ms, REDUCED_SLEEP_CAP_MS) : ms,
        );
        timers.add(t);
      });

    const patchLane = (bid: string, fn: (l: NegotiationState["lanes"][string]) => NegotiationState["lanes"][string]) =>
      setState((s) => ({ ...s, lanes: { ...s.lanes, [bid]: fn(s.lanes[bid]) } }));

    function tryFinish() {
      if (pendingStatus && pumping.size === 0 && [...queues.values()].every((q) => q.length === 0)) {
        const st = pendingStatus;
        pendingStatus = null;
        setState((s) => ({ ...s, status: st }));
      }
    }

    async function pump(bid: string) {
      if (pumping.has(bid)) return;
      pumping.add(bid);
      const q = queues.get(bid)!;
      while (q.length && !cancelled) {
        const ev = q.shift()!;
        if (ev.type === "message") {
          const m = ev.message;
          patchLane(bid, (l) => ({ ...l, typing: m.fromAgent }));
          await sleep(TYPING_BASE_MS + Math.min(m.text.length * TYPING_PER_CHAR_MS, TYPING_MAX_EXTRA_MS));
          if (cancelled) break;
          patchLane(bid, (l) => ({ ...l, typing: null, round: Math.max(l.round, m.round), messages: [...l.messages, { ...m, shown: 0 }] }));
          const step = reduce ? m.text.length : REVEAL_CHARS_PER_TICK;
          for (let n = step; !cancelled; n += step) {
            const upto = Math.min(n, m.text.length);
            patchLane(bid, (l) => ({ ...l, messages: l.messages.map((x) => (x.id === m.id ? { ...x, shown: upto } : x)) }));
            if (upto >= m.text.length) break;
            await sleep(REVEAL_TICK_MS);
          }
          await sleep(MESSAGE_GAP_MS);
        } else if (ev.type === "best_offer") {
          setState((s) => {
            // Bitta biznes ikki vazifaga taklif bersa, ikkinchisi alohida kalitda (birinchisi bid bo'yicha qoladi)
            const prev = s.best[ev.businessId];
            const key = prev?.taskId && ev.taskId && prev.taskId !== ev.taskId ? `${ev.taskId}|${ev.businessId}` : ev.businessId;
            return { ...s, best: { ...s.best, [key]: { taskId: ev.taskId, businessId: ev.businessId, businessName: ev.businessName, offer: ev.offer } } };
          });
        }
      }
      pumping.delete(bid);
      tryFinish();
    }

    const enqueue = (bid: string, ev: NegotiationEvent) => {
      if (!queues.has(bid)) {
        queues.set(bid, []);
        setState((s) => ({
          ...s,
          order: [...s.order, bid],
          lanes: { ...s.lanes, [bid]: { businessId: bid, messages: [], typing: null, round: 0 } },
        }));
      }
      queues.get(bid)!.push(ev);
      void pump(bid);
    };

    const onEvent = (ev: NegotiationEvent) => {
      if (cancelled) return;
      if (ev.type === "message") enqueue(ev.message.businessId, ev);
      else if (ev.type === "best_offer") enqueue(ev.businessId, ev);
      else if (ev.type === "error") setState((s) => ({ ...s, error: ev.error }));
      else if (ev.status === "running") setState((s) => ({ ...s, status: "running" }));
      else {
        pendingStatus = ev.status;
        tryFinish();
      }
    };

    const stop = forceMock
      ? runMockStream(id, undefined, onEvent)
      : streamNegotiation(id, onEvent, (msg) => !cancelled && setState((s) => ({ ...s, error: msg })));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      stop();
    };
  }, [id, forceMock]);

  return state;
}
