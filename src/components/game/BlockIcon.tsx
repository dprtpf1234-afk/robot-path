"use client";
import type { BlockType, Color } from "@/engine/types";

export const BLOCK_META: Record<BlockType, { label: string; bg: string; border: string }> = {
  forward: { label: "앞으로", bg: "#2563eb", border: "#1e3a8a" },
  left: { label: "왼쪽", bg: "#7c3aed", border: "#4c1d95" },
  right: { label: "오른쪽", bg: "#7c3aed", border: "#4c1d95" },
  repeat: { label: "반복", bg: "#c2410c", border: "#7c2d12" },
  ifWall: { label: "막혔다면", bg: "#047857", border: "#064e3b" },
  ifColor: { label: "색이라면", bg: "#047857", border: "#064e3b" },
  untilGoal: { label: "도착까지", bg: "#be185d", border: "#831843" },
};

export const COLOR_META: Record<Color, { fill: string; name: string; symbol: "tri" | "dot" }> = {
  red: { fill: "#ef4444", name: "빨강", symbol: "tri" },
  blue: { fill: "#3b82f6", name: "파랑", symbol: "dot" },
};

export function ColorMark({ color, size = 28 }: { color: Color; size?: number }) {
  const m = COLOR_META[color];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={m.name}>
      <circle cx="20" cy="20" r="18" fill={m.fill} stroke="#fff" strokeWidth="3" />
      {m.symbol === "tri" ? <path d="M20 9 L31 28 L9 28 Z" fill="#fff" /> : <circle cx="20" cy="20" r="7" fill="#fff" />}
    </svg>
  );
}

export function BlockIcon({ t, color, size = 32 }: { t: BlockType; color?: Color; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 40 40", fill: "none", stroke: "#fff", strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (t) {
    case "forward":
      return (
        <svg {...s} aria-hidden>
          <path d="M20 34 V8 M9 18 L20 7 L31 18" />
        </svg>
      );
    case "left":
      return (
        <svg {...s} aria-hidden>
          <path d="M30 34 V22 Q30 12 20 12 H9 M15 5 L8 12 L15 19" />
        </svg>
      );
    case "right":
      return (
        <svg {...s} aria-hidden>
          <path d="M10 34 V22 Q10 12 20 12 H31 M25 5 L32 12 L25 19" />
        </svg>
      );
    case "repeat":
      return (
        <svg {...s} aria-hidden>
          <path d="M8 22 A12 12 0 0 1 30 12 M30 5 V13 H22" />
          <path d="M32 18 A12 12 0 0 1 10 28 M10 35 V27 H18" />
        </svg>
      );
    case "ifWall":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <rect x="3" y="8" width="24" height="24" rx="2" fill="#fbbf24" stroke="#fff" strokeWidth="2.5" />
          <path d="M3 16 H27 M3 24 H27 M15 8 V16 M9 16 V24 M21 16 V24 M15 24 V32" stroke="#92400e" strokeWidth="2" />
          <text x="33" y="30" fontSize="20" fontWeight="900" fill="#fff" textAnchor="middle">?</text>
        </svg>
      );
    case "ifColor":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <circle cx="15" cy="20" r="12" fill={COLOR_META[color ?? "red"].fill} stroke="#fff" strokeWidth="3" />
          {(color ?? "red") === "red" ? <path d="M15 12 L22 25 L8 25 Z" fill="#fff" /> : <circle cx="15" cy="20" r="5" fill="#fff" />}
          <text x="33" y="30" fontSize="20" fontWeight="900" fill="#fff" textAnchor="middle">?</text>
        </svg>
      );
    case "untilGoal":
      return (
        <svg {...s} aria-hidden>
          <path d="M10 35 V6" />
          <path d="M10 7 H28 L24 13 L28 19 H10" fill="#fde047" stroke="#fff" strokeWidth="3" />
          <path d="M34 26 A8 8 0 1 1 26 20 M26 15 V21 H32" strokeWidth="3" />
        </svg>
      );
  }
}
