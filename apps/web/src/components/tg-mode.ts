import type { ChatMode } from "@/lib/types";

export const CHAT_MODES: { id: ChatMode; label: string; desc: string; cls: string }[] = [
  { id: "copilot", label: "Copilot", desc: "AI javob qoralamasini yozadi, siz ko'rib yuborasiz.", cls: "bg-tint-2 text-green-900" },
  { id: "command", label: "Buyruq", desc: "Agent faqat siz bergan buyruqni bajaradi.", cls: "bg-biz-soft text-biz" },
  { id: "autopilot", label: "Autopilot", desc: "Agent o'zi javob beradi, murakkab holatda sizga yo'naltiradi.", cls: "bg-green-600 text-white" },
  { id: "off", label: "O'chiq", desc: "Agent bu chatga aralashmaydi.", cls: "bg-muted text-muted-foreground" },
];
