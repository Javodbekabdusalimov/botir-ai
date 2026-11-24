"use client";

import { useEffect, useState } from "react";
import { streamNegotiation } from "@/lib/api";
import { runMockStream } from "@/lib/mock";
import type { AgentMessage, NegotiationEvent, NegotiationStatus, Offer } from "@/lib/types";

export interface ShownMessage extends AgentMessage {
  /** Hozircha ko'rsatilgan belgilar soni (yozilish animatsiyasi) */
  shown: number;
}

export interface PlaybackState {
  messages: ShownMessage[];
  typing: AgentMessage["role"] | null;
  offer: Offer | null;
  status: NegotiationStatus;
  error: string | null;
}

const INITIAL: PlaybackState = { messages: [], typing: null, offer: null, status: "running", error: null };

/**
 * SSE (yoki mock) hodisalarini navbatga qo'yib, "yozmoqda..." va harf-harf animatsiya bilan ketma-ket ko'rsatadi.
 * Hodisa tezligi (backend/mocks) qanday bo'lishidan qat'i nazar, ekran o'qiladigan sur'atda yuradi.
 */
export function useNegotiation(id: string, forceMock = false): PlaybackState {
  const [state, setState] = useState<PlaybackState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const queue: NegotiationEvent[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let pumping = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, reduce ? Math.min(ms, 60) : ms);
        timers.add(t);
      });

    async function pump() {
      if (pumping) return;
      pumping = true;
      while (queue.length && !cancelled) {
        const ev = queue.shift()!;
        if (ev.type === "message") {
          const m = ev.message;
          setState((s) => ({ ...s, typing: m.role }));
          await sleep(650 + Math.min(m.text.length * 6, 700));
          if (cancelled) break;
          setState((s) => ({ ...s, typing: null, messages: [...s.messages, { ...m, shown: 0 }] }));
          const step = reduce ? m.text.length : 3;
          for (let n = step; !cancelled; n += step) {
            const upto = Math.min(n, m.text.length);
            setState((s) => ({
              ...s,
              messages: s.messages.map((x) => (x.id === m.id ? { ...x, shown: upto } : x)),
            }));
            if (upto >= m.text.length) break;
            await sleep(18);
          }
          await sleep(450);
        } else if (ev.type === "offer") {
          setState((s) => ({ ...s, offer: ev.offer }));
          await sleep(300);
        } else {
          setState((s) => ({ ...s, status: ev.status }));
        }
      }
      pumping = false;
    }

    const onEvent = (ev: NegotiationEvent) => {
      queue.push(ev);
      void pump();
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
