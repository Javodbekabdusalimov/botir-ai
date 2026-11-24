"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { BotirChat } from "@/components/botir-chat";

const HIDE = ["/live", "/pay", "/assistant", "/dashboard", "/login", "/register", "/connect"];

/** Pastki o'ngdagi "Botir AI bilan gaplashing" tugmasi: slide-up chat paneli. */
export function ChatLauncher() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (HIDE.some((p) => path.startsWith(p))) return null;
  return (
    <>
      {mounted && (
        <section
          aria-label="Botir AI chat"
          hidden={!open}
          className="slide-up fixed inset-x-3 bottom-[4.5rem] z-50 flex h-[min(34rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lift sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[26rem]"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-green-700 to-green-500 px-4 py-3 text-white">
            <span className="grid size-10 place-items-center rounded-full bg-white/20 text-sm font-bold backdrop-blur">AI</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">Botir AI</p>
              <p className="flex items-center gap-1.5 text-xs text-green-50">
                <span className="size-1.5 rounded-full bg-green-200" /> shaxsiy agent · onlayn
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Chatni yopish" className="grid size-9 place-items-center rounded-full hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>
          <BotirChat className="flex-1" />
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={`fixed bottom-20 right-4 z-50 flex h-12 items-center gap-2 rounded-full bg-green-600 px-4 text-sm font-bold text-white shadow-lift transition-transform hover:scale-105 hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:bottom-6 sm:right-6 ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <MessageCircle className="size-5" aria-hidden="true" />}
        <span className="hidden sm:inline">Botir AI bilan gaplashing</span>
        <span className="sm:hidden">{open ? "Yopish" : "AI chat"}</span>
      </button>
    </>
  );
}
