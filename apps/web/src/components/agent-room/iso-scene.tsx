"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Izometrik "agent xonasi" sahnasi (SVG, rasm/3D kutubxonasiz).
 * Koordinatalar: x — o'ngga-pastga, y — chapga-pastga, z — yuqoriga (1 birlik = U px).
 * Ob'ektlar chuqurlik (x+y) bo'yicha saralanadi: orqadagilar avval chiziladi.
 */

const U = 24;
const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);
export const VB = { x: -222, y: -78, w: 444, h: 312 };

function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * C * U, (x + y) * S * U - z * U];
}
const pts = (a: [number, number][]) => a.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

/** Ekrandagi nuqta -> konteynerga nisbatan foiz (HTML ustqatlamlar uchun). */
export function toPct(x: number, y: number, z = 0) {
  const [sx, sy] = iso(x, y, z);
  return { left: `${((sx - VB.x) / VB.w) * 100}%`, top: `${((sy - VB.y) / VB.h) * 100}%` };
}

type Tone = { top: string; left: string; right: string };
const WHITE: Tone = { top: "#ffffff", left: "#eef0f2", right: "#e2e5e8" };
const WOOD: Tone = { top: "#f3e7d3", left: "#e6d5b8", right: "#d9c6a5" };
const GREEN: Tone = { top: "#22c55e", left: "#16a34a", right: "#15803d" };
const DARK: Tone = { top: "#3f3f46", left: "#27272a", right: "#18181b" };
const CLAY: Tone = { top: "#fafafa", left: "#e7e5e4", right: "#d6d3d1" };

function Box({ x, y, z = 0, w, d, h, tone = WHITE, r }: { x: number; y: number; z?: number; w: number; d: number; h: number; tone?: Tone; r?: string }) {
  const t = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
  const l = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)];
  const rt = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)];
  return (
    <g strokeLinejoin="round" strokeWidth={r ? 6 : 0.6} stroke={r ? undefined : "rgba(0,0,0,0.05)"}>
      <polygon points={pts(l)} fill={tone.left} stroke={r ? tone.left : undefined} />
      <polygon points={pts(rt)} fill={tone.right} stroke={r ? tone.right : undefined} />
      <polygon points={pts(t)} fill={tone.top} stroke={r ? tone.top : undefined} />
    </g>
  );
}

function Shadow({ x, y, rx = 22, ry = 11, o = 0.12 }: { x: number; y: number; rx?: number; ry?: number; o?: number }) {
  const [sx, sy] = iso(x, y, 0);
  return <ellipse cx={sx} cy={sy} rx={rx} ry={ry} fill="#0f172a" opacity={o} />;
}

function Plant({ x, y, big }: { x: number; y: number; big?: boolean }) {
  const [sx, sy] = iso(x + 0.35, y + 0.35, big ? 1.6 : 1.1);
  const k = big ? 1.35 : 1;
  return (
    <g>
      <Shadow x={x + 0.35} y={y + 0.35} rx={16 * k} ry={8 * k} />
      <Box x={x} y={y} w={0.7} d={0.7} h={big ? 0.9 : 0.6} tone={CLAY} />
      {[
        [-10, -6, 12],
        [9, -4, 11],
        [0, -16, 13],
        [-6, -24, 9],
        [7, -22, 10],
      ].map(([dx, dy, r], i) => (
        <ellipse key={i} cx={sx + dx * k} cy={sy + dy * k} rx={r * k * 0.75} ry={r * k} fill={i % 2 ? "#4ade80" : "#16a34a"} transform={`rotate(${dx * 2} ${sx + dx * k} ${sy + dy * k})`} />
      ))}
    </g>
  );
}

const SKIN = ["#f6d1b5", "#e9b48f", "#d39a72", "#f2c6a0"];
const HAIR = ["#3b2416", "#111827", "#7c4a2d", "#a16207", "#1f2937"];
const SHIRT = ["#16a34a", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

/** O'tirgan personaj: stul + tana + bosh. `seed` rangi barqaror bo'lishi uchun. */
function Person({ x, y, seed, facing = "right", active }: { x: number; y: number; seed: number; facing?: "left" | "right"; active?: boolean }) {
  const [sx, sy] = iso(x, y, 0);
  const shirt = SHIRT[seed % SHIRT.length];
  const skin = SKIN[seed % SKIN.length];
  const hair = HAIR[(seed * 3) % HAIR.length];
  const f = facing === "right" ? 1 : -1;
  const id = `p${seed}`;
  return (
    <g>
      <defs>
        <radialGradient id={`${id}h`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="45%" stopColor={skin} />
          <stop offset="100%" stopColor={skin} stopOpacity="0.85" />
        </radialGradient>
        <linearGradient id={`${id}b`} x1="0" x2="1">
          <stop offset="0%" stopColor={shirt} stopOpacity="0.85" />
          <stop offset="55%" stopColor={shirt} />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <Shadow x={x} y={y} rx={18} ry={9} o={0.14} />
      {/* stul */}
      <ellipse cx={sx} cy={sy - 10} rx={15} ry={7.5} fill="#d4d4d8" />
      <rect x={sx - 2} y={sy - 10} width={4} height={10} fill="#a1a1aa" />
      <path d={`M${sx - 14 * f} ${sy - 12} q ${-3 * f} -20 ${4 * f} -30 l ${8 * f} 2 q ${-6 * f} 10 ${-2 * f} 28 z`} fill="#e4e4e7" />
      {/* tana */}
      <path d={`M${sx - 11} ${sy - 12} q 0 -24 11 -26 q 11 2 11 26 q -11 6 -22 0 z`} fill={`url(#${id}b)`} />
      {/* qo'llar (stol tomonga) */}
      <path d={`M${sx + 4 * f} ${sy - 30} q ${12 * f} 6 ${16 * f} 12`} stroke={shirt} strokeWidth={6} strokeLinecap="round" fill="none" />
      <circle cx={sx + 20 * f} cy={sy - 18} r={3.2} fill={skin} />
      {/* bosh */}
      <circle cx={sx} cy={sy - 47} r={11} fill={`url(#${id}h)`} />
      <path d={`M${sx - 11.5} ${sy - 47} q 1 -15 12 -14 q 12 0 11.5 13 q -4 -7 -12 -7 q -8 0 -11.5 8 z`} fill={hair} />
      {seed % 3 === 1 && <circle cx={sx - 9 * f} cy={sy - 56} r={6} fill={hair} />}
      {active && <circle cx={sx} cy={sy - 47} r={15.5} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="3 4" className="room-spin" />}
    </g>
  );
}

function Laptop({ x, y, z, glow }: { x: number; y: number; z: number; glow?: boolean }) {
  const base = [iso(x, y, z), iso(x + 0.6, y, z), iso(x + 0.6, y + 0.45, z), iso(x, y + 0.45, z)];
  const scr = [iso(x, y, z), iso(x + 0.6, y, z), iso(x + 0.6, y, z + 0.45), iso(x, y, z + 0.45)];
  return (
    <g>
      <polygon points={pts(base)} fill="#d4d4d8" />
      <polygon points={pts(scr)} fill={glow ? "#22c55e" : "#52525b"} />
    </g>
  );
}

function Desk({ x, y, w = 1.8, d = 1.1 }: { x: number; y: number; w?: number; d?: number }) {
  return (
    <g>
      <Shadow x={x + w / 2} y={y + d / 2} rx={34} ry={16} o={0.1} />
      <Box x={x + 0.1} y={y + 0.1} w={0.12} d={0.12} h={0.75} tone={CLAY} />
      <Box x={x + w - 0.22} y={y + d - 0.22} w={0.12} d={0.12} h={0.75} tone={CLAY} />
      <Box x={x + 0.1} y={y + d - 0.22} w={0.12} d={0.12} h={0.75} tone={CLAY} />
      <Box x={x} y={y} z={0.75} w={w} d={d} h={0.1} tone={WHITE} />
    </g>
  );
}

export type Seat = { key: string; x: number; y: number; seed: number; facing?: "left" | "right"; active?: boolean; laptopGlow?: boolean };

/** Stol joylari (mijoz agentlari). Botir doim peshtaxta ortida. */
export const SEATS: { desk: [number, number]; person: [number, number]; facing: "left" | "right"; laptop: [number, number] }[] = [
  { desk: [6.2, 1.4], person: [5.85, 1.95], facing: "right", laptop: [6.4, 1.7] },
  { desk: [6.8, 4.7], person: [6.45, 5.25], facing: "right", laptop: [7.0, 5.0] },
  { desk: [3.0, 6.7], person: [2.65, 7.25], facing: "right", laptop: [3.2, 7.0] },
  { desk: [4.1, 3.3], person: [3.75, 3.85], facing: "right", laptop: [4.3, 3.6] },
];
export const BOTIR_POS: [number, number] = [0.85, 3.7];

export function IsoScene({ seats, botirActive, children, className }: { seats: Seat[]; botirActive?: boolean; children?: ReactNode; className?: string }) {
  const used = seats.slice(0, SEATS.length);
  // chuqurlik bo'yicha saralangan ob'ektlar
  const items: { depth: number; node: ReactNode }[] = [
    { depth: 0.5, node: <Plant key="pl1" x={0.3} y={0.3} big /> },
    { depth: 9.4, node: <Plant key="pl2" x={8.9} y={0.4} /> },
    { depth: 9.6, node: <Plant key="pl3" x={0.4} y={9.0} /> },
    { depth: 17.7, node: <Plant key="pl4" x={9.1} y={8.6} /> },
    // ekran (o'ng orqa devor o'rnida): savdo grafigi
    {
      depth: 4.1,
      node: (
        <g key="screen">
          <Box x={3.6} y={0.2} w={2.4} d={0.15} h={0.1} tone={CLAY} />
          <Box x={4.7} y={0.22} w={0.15} d={0.1} h={1.1} tone={CLAY} />
          <Box x={3.7} y={0.15} z={1.1} w={2.2} d={0.12} h={1.35} tone={WHITE} />
          {[0.35, 0.65, 0.5, 0.95, 1.1].map((hgt, i) => {
            const bx = 3.95 + i * 0.38;
            const p = [iso(bx, 0.27, 1.25), iso(bx + 0.22, 0.27, 1.25), iso(bx + 0.22, 0.27, 1.25 + hgt * 0.95), iso(bx, 0.27, 1.25 + hgt * 0.95)];
            return <polygon key={i} points={pts(p)} fill={i === 4 ? "#16a34a" : "#86efac"} />;
          })}
        </g>
      ),
    },
    // Botir peshtaxtasi (chap tomonda, y o'qi bo'ylab)
    {
      depth: 6.0,
      node: (
        <g key="counter">
          <Shadow x={1.8} y={3.7} rx={44} ry={30} o={0.1} />
          <Box x={1.4} y={2.4} w={0.8} d={2.6} h={0.62} tone={WHITE} />
          <Box x={1.4} y={2.4} z={0.62} w={0.8} d={2.6} h={0.08} tone={GREEN} />
          <Laptop x={1.5} y={3.3} z={0.7} glow />
        </g>
      ),
    },
    { depth: 4.55, node: <Person key="botir" x={BOTIR_POS[0]} y={BOTIR_POS[1]} seed={0} facing="right" active={botirActive} /> },
    // divan (old tomonda)
    {
      depth: 11.5,
      node: (
        <g key="sofa">
          <Shadow x={7.0} y={8.4} rx={46} ry={20} o={0.1} />
          <Box x={6.0} y={7.7} w={2.0} d={1.0} h={0.45} tone={WOOD} />
          <Box x={6.0} y={7.7} w={2.0} d={0.3} h={0.95} tone={WOOD} />
          <Box x={6.05} y={8.05} z={0.45} w={0.9} d={0.6} h={0.12} tone={WHITE} />
          <Box x={7.05} y={8.05} z={0.45} w={0.9} d={0.6} h={0.12} tone={WHITE} />
        </g>
      ),
    },
  ];
  // Stollar doim turadi; mijoz bo'lmagan stol bo'sh (keyingi suhbat uchun joy)
  SEATS.forEach((seat, i) => {
    const s = used[i];
    items.push({ depth: seat.desk[0] + seat.desk[1] + 0.6, node: <Desk key={`d${i}`} x={seat.desk[0]} y={seat.desk[1]} /> });
    items.push({ depth: seat.desk[0] + seat.desk[1] + 0.7, node: <Laptop key={`l${i}`} x={seat.laptop[0]} y={seat.laptop[1]} z={0.85} glow={s?.laptopGlow} /> });
    if (s) items.push({ depth: seat.person[0] + seat.person[1], node: <Person key={`p${s.key}`} x={seat.person[0]} y={seat.person[1]} seed={s.seed} facing={seat.facing} active={s.active} /> });
  });
  items.sort((a, b) => a.depth - b.depth);

  const slab = [iso(0, 0, 0), iso(10, 0, 0), iso(10, 10, 0), iso(0, 10, 0)];
  const slabL = [iso(0, 10, 0), iso(10, 10, 0), iso(10, 10, -0.45), iso(0, 10, -0.45)];
  const slabR = [iso(10, 0, 0), iso(10, 10, 0), iso(10, 10, -0.45), iso(10, 0, -0.45)];

  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="absolute inset-0 size-full" role="img" aria-label="Agent xonasi: Botir peshtaxta ortida, mijoz agentlari stollarda">
        <defs>
          <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f3" />
          </linearGradient>
        </defs>
        <g strokeLinejoin="round">
          <polygon points={pts(slabL)} fill="#e5e7eb" stroke="#e5e7eb" strokeWidth={10} />
          <polygon points={pts(slabR)} fill="#d9dde1" stroke="#d9dde1" strokeWidth={10} />
          <polygon points={pts(slab)} fill="url(#floor)" stroke="#ffffff" strokeWidth={10} />
        </g>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
          <g key={i} stroke="#e8ece9" strokeWidth={0.8}>
            <line x1={iso(i, 0)[0]} y1={iso(i, 0)[1]} x2={iso(i, 10)[0]} y2={iso(i, 10)[1]} />
            <line x1={iso(0, i)[0]} y1={iso(0, i)[1]} x2={iso(10, i)[0]} y2={iso(10, i)[1]} />
          </g>
        ))}
        {/* gilam */}
        <polygon points={pts([iso(4.6, 3.6), iso(8.4, 3.6), iso(8.4, 6.9), iso(4.6, 6.9)])} fill="#dcfce7" opacity={0.7} />
        {items.map((it) => it.node)}
      </svg>
      {children}
    </div>
  );
}

export { DARK };
