"use client";
import type { BlockType, Color } from "@/engine/types";

/** 블록 글자·아이콘 색 (파스텔 바탕 위에서 대비 4.5:1 이상) */
export const INK = "#3d3a5c";

export const BLOCK_META: Record<BlockType, { label: string; bg: string; border: string }> = {
  forward: { label: "앞으로", bg: "#a9cdf0", border: "#7fa7d4" },
  left: { label: "왼쪽", bg: "#cbbcf0", border: "#a28fd6" },
  right: { label: "오른쪽", bg: "#cbbcf0", border: "#a28fd6" },
  repeat: { label: "반복", bg: "#f6c6a5", border: "#d99b74" },
  ifWall: { label: "막혔다면", bg: "#a9dcc9", border: "#77b79f" },
  ifColor: { label: "색이라면", bg: "#a9dcc9", border: "#77b79f" },
  untilGoal: { label: "도착까지", bg: "#f4b9cb", border: "#d58ea6" },
};

export const COLOR_META: Record<Color, { fill: string; light: string; name: string; symbol: "tri" | "dot" }> = {
  red: { fill: "#f2968b", light: "#f8c1ba", name: "빨강", symbol: "tri" },
  blue: { fill: "#86b5ea", light: "#c3dcf6", name: "파랑", symbol: "dot" },
};

export function ColorMark({ color, size = 28 }: { color: Color; size?: number }) {
  const m = COLOR_META[color];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={m.name}>
      <circle cx="20" cy="20" r="18" fill={m.fill} />
      {m.symbol === "tri" ? <path d="M20 9 L31 28 L9 28 Z" fill="#fff" /> : <circle cx="20" cy="20" r="7" fill="#fff" />}
    </svg>
  );
}

export function BlockIcon({ t, color, size = 32 }: { t: BlockType; color?: Color; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 40 40", fill: "none", stroke: INK, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
          <rect x="3" y="9" width="23" height="23" rx="3" fill="#fff" />
          <path d="M14.5 9 H23 A3 3 0 0 1 26 12 V29 A3 3 0 0 1 23 32 H14.5 Z" fill={INK} opacity="0.16" />
          <path d="M3 17 H26 M3 24.5 H26 M14.5 9 V17 M8.5 17 V24.5 M20.5 17 V24.5 M14.5 24.5 V32" stroke={INK} strokeWidth="1.6" opacity="0.45" />
          <text x="33" y="30" fontSize="20" fontWeight="900" fill={INK} textAnchor="middle">?</text>
        </svg>
      );
    case "ifColor":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
          <circle cx="15" cy="20" r="12" fill={COLOR_META[color ?? "red"].fill} />
          {(color ?? "red") === "red" ? <path d="M15 12 L22 25 L8 25 Z" fill="#fff" /> : <circle cx="15" cy="20" r="5" fill="#fff" />}
          <text x="33" y="30" fontSize="20" fontWeight="900" fill={INK} textAnchor="middle">?</text>
        </svg>
      );
    case "untilGoal":
      return (
        <svg {...s} aria-hidden>
          <path d="M10 35 V6" />
          <path d="M10 7 H28 L24 13 L28 19 H10" fill="#fff" stroke={INK} strokeWidth="3" />
          <path d="M34 26 A8 8 0 1 1 26 20 M26 15 V21 H32" strokeWidth="3" />
        </svg>
      );
  }
}
