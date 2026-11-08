/* 테마 6종: 겉모습만 바꾸는 스킨. 모든 그래픽은 직접 그린 SVG.
 * 각 컴포넌트는 한 칸을 0~100 좌표로 그린다. 로봇은 북쪽(위)을 바라보는 모습으로 그리고, 화면에서 회전시킨다. */
import type { ReactElement } from "react";

export interface RobotLook {
  body: string;
  trim: string;
  visor: string;
  eye: string;
  feature: "antenna" | "periscope" | "cap" | "leaf" | "hat" | "beanie";
}

export interface Theme {
  id: string;
  name: string;
  robotName: string;
  goalName: string;
  obstacleName: string;
  bg: string;
  floor: string;
  floorAlt: string;
  grid: string;
  ui: string; // 테마 강조색 (버튼 등)
  /** 2.5D 배경 밝은 쪽 / 보드 옆면 */
  bg2: string;
  side: string;
  /** 2.5D 로봇 색과 머리 장식 (components/game/Robot25.tsx가 그림) */
  robot: RobotLook;
  Goal: () => ReactElement;
  Obstacle: () => ReactElement;
  /** 길 칸 장식 (작은 무늬). 칸 좌표로 다양하게 */
  FloorDecor?: (p: { seed: number }) => ReactElement | null;
}

export const THEMES: Theme[] = [
  {
    id: "space",
    name: "우주",
    robotName: "탐사 로버",
    goalName: "에너지 크리스털",
    obstacleName: "운석",
    bg: "#1e2148",
    floor: "#565c96",
    floorAlt: "#4d5389",
    grid: "#2c3060",
    ui: "#6366f1",
    bg2: "#3b3f8f",
    side: "#191b3d",
    robot: { body: "#e2e8f0", trim: "#6366f1", visor: "#1e293b", eye: "#67e8f9", feature: "antenna" },
    Goal: () => (
      <g>
        <ellipse cx="50" cy="84" rx="26" ry="6" fill="#000" opacity="0.25" />
        <path d="M50 12 L72 40 L60 84 L40 84 L28 40 Z" fill="#a78bfa" stroke="#4c1d95" strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 12 L56 40 L50 84 L44 40 Z" fill="#ddd6fe" />
        <circle cx="70" cy="22" r="4" fill="#fde68a" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <path d="M18 60 Q14 30 40 20 Q70 12 84 40 Q92 70 64 84 Q30 92 18 60 Z" fill="#8b5e3c" stroke="#3f2a1a" strokeWidth="3" />
        <circle cx="40" cy="44" r="9" fill="#6b4529" />
        <circle cx="64" cy="62" r="7" fill="#6b4529" />
        <circle cx="62" cy="34" r="4" fill="#6b4529" />
      </g>
    ),
    FloorDecor: ({ seed }) =>
      seed % 5 === 0 ? <circle cx={30 + (seed % 40)} cy={30 + ((seed * 7) % 40)} r="5" fill="#000" opacity="0.15" /> : null,
  },
  {
    id: "ocean",
    name: "바다",
    robotName: "잠수정",
    goalName: "보물 상자",
    obstacleName: "산호초",
    bg: "#0b4566",
    floor: "#2f8fb8",
    floorAlt: "#2a84ab",
    grid: "#0e5378",
    ui: "#0284c7",
    bg2: "#1683b0",
    side: "#083650",
    robot: { body: "#facc15", trim: "#f97316", visor: "#0c4a6e", eye: "#7dd3fc", feature: "periscope" },
    Goal: () => (
      <g>
        <rect x="18" y="44" width="64" height="38" rx="4" fill="#b45309" stroke="#451a03" strokeWidth="3" />
        <path d="M18 46 Q50 18 82 46 Z" fill="#d97706" stroke="#451a03" strokeWidth="3" />
        <rect x="44" y="44" width="12" height="16" rx="2" fill="#fde047" stroke="#451a03" strokeWidth="2" />
        <circle cx="30" cy="36" r="4" fill="#fde047" />
        <circle cx="66" cy="34" r="3" fill="#fde047" />
      </g>
    ),
    Obstacle: () => (
      <g fill="none" strokeLinecap="round" strokeWidth="9">
        <path d="M50 90 L50 50 L32 28 M50 60 L70 34 M70 34 L74 18 M32 28 L26 14" stroke="#f472b6" />
        <path d="M24 90 L26 66 L14 52 M76 90 L78 64 L88 50" stroke="#fb7185" />
      </g>
    ),
    FloorDecor: ({ seed }) =>
      seed % 6 === 1 ? (
        <g fill="#e0f2fe" opacity="0.5">
          <circle cx="24" cy="70" r="4" />
          <circle cx="32" cy="58" r="2.5" />
        </g>
      ) : null,
  },
  {
    id: "town",
    name: "마을",
    robotName: "배달 로봇",
    goalName: "택배 상자",
    obstacleName: "공사 펜스",
    bg: "#7c9a5a",
    floor: "#d6d3d1",
    floorAlt: "#cfcbc8",
    grid: "#a8a29e",
    ui: "#ea580c",
    bg2: "#a7c47f",
    side: "#4f6838",
    robot: { body: "#f8fafc", trim: "#f97316", visor: "#1f2937", eye: "#4ade80", feature: "cap" },
    Goal: () => (
      <g>
        <path d="M20 36 L50 22 L80 36 L80 76 L50 90 L20 76 Z" fill="#d6a46a" stroke="#78350f" strokeWidth="3" strokeLinejoin="round" />
        <path d="M20 36 L50 50 L80 36 M50 50 L50 90" stroke="#78350f" strokeWidth="3" fill="none" />
        <path d="M35 29 L65 43" stroke="#fef3c7" strokeWidth="6" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="16" y="76" width="10" height="14" fill="#374151" />
        <rect x="74" y="76" width="10" height="14" fill="#374151" />
        <rect x="10" y="30" width="80" height="46" rx="4" fill="#fff" stroke="#1f2937" strokeWidth="3" />
        <path d="M14 30 L34 30 L14 60 Z M44 30 L64 30 L30 76 L14 76 Z M74 30 L90 30 L90 40 L62 76 L46 76 Z M90 58 L90 76 L78 76 Z" fill="#f97316" />
        <circle cx="20" cy="24" r="6" fill="#facc15" stroke="#1f2937" strokeWidth="2" />
        <circle cx="80" cy="24" r="6" fill="#facc15" stroke="#1f2937" strokeWidth="2" />
      </g>
    ),
    FloorDecor: ({ seed }) => (seed % 4 === 2 ? <rect x="44" y="20" width="12" height="60" fill="#fafaf9" opacity="0.6" /> : null),
  },
  {
    id: "forest",
    name: "숲",
    robotName: "탐험 로봇",
    goalName: "길 잃은 동물 친구",
    obstacleName: "나무",
    bg: "#2f5d34",
    floor: "#d9c08a",
    floorAlt: "#cfb47b",
    grid: "#3f7a45",
    ui: "#16a34a",
    bg2: "#4f8a52",
    side: "#1f4024",
    robot: { body: "#86efac", trim: "#15803d", visor: "#14532d", eye: "#fef08a", feature: "leaf" },
    Goal: () => (
      <g>
        <ellipse cx="34" cy="24" rx="8" ry="18" fill="#fef3c7" stroke="#92400e" strokeWidth="3" />
        <ellipse cx="66" cy="24" rx="8" ry="18" fill="#fef3c7" stroke="#92400e" strokeWidth="3" />
        <circle cx="50" cy="58" r="28" fill="#fef3c7" stroke="#92400e" strokeWidth="3" />
        <circle cx="40" cy="54" r="4" fill="#1f2937" />
        <circle cx="60" cy="54" r="4" fill="#1f2937" />
        <ellipse cx="50" cy="64" rx="5" ry="3.5" fill="#f472b6" />
        <circle cx="32" cy="66" r="5" fill="#fda4af" opacity="0.7" />
        <circle cx="68" cy="66" r="5" fill="#fda4af" opacity="0.7" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="42" y="64" width="16" height="26" fill="#78350f" />
        <circle cx="50" cy="40" r="28" fill="#15803d" stroke="#14532d" strokeWidth="3" />
        <circle cx="32" cy="56" r="16" fill="#16a34a" stroke="#14532d" strokeWidth="3" />
        <circle cx="68" cy="56" r="16" fill="#16a34a" stroke="#14532d" strokeWidth="3" />
      </g>
    ),
    FloorDecor: ({ seed }) =>
      seed % 5 === 3 ? (
        <g fill="#65a30d">
          <path d="M20 80 l4 -10 l4 10 Z" />
          <path d="M28 82 l3 -8 l3 8 Z" />
        </g>
      ) : null,
  },
  {
    id: "desert",
    name: "사막",
    robotName: "탐사 로봇",
    goalName: "오아시스",
    obstacleName: "선인장",
    bg: "#c98a3e",
    floor: "#f5dfae",
    floorAlt: "#efd59c",
    grid: "#d9a35a",
    ui: "#d97706",
    bg2: "#ecc27a",
    side: "#8f5b20",
    robot: { body: "#fb923c", trim: "#9a3412", visor: "#431407", eye: "#fde68a", feature: "hat" },
    Goal: () => (
      <g>
        <ellipse cx="50" cy="72" rx="36" ry="16" fill="#38bdf8" stroke="#0369a1" strokeWidth="3" />
        <ellipse cx="44" cy="70" rx="12" ry="4" fill="#bae6fd" />
        <path d="M70 66 Q72 40 66 22" stroke="#92400e" strokeWidth="6" fill="none" />
        <path d="M66 22 Q50 14 38 26 M66 22 Q80 10 92 22 M66 22 Q60 34 50 40 M66 22 Q80 30 86 40" stroke="#16a34a" strokeWidth="6" fill="none" strokeLinecap="round" />
      </g>
    ),
    Obstacle: () => (
      <g stroke="#14532d" strokeWidth="3">
        <rect x="40" y="14" width="20" height="76" rx="10" fill="#22c55e" />
        <path d="M40 54 L26 54 Q20 54 20 46 L20 32" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" />
        <path d="M60 44 L74 44 Q80 44 80 36 L80 26" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" />
      </g>
    ),
    FloorDecor: ({ seed }) =>
      seed % 4 === 1 ? <path d="M16 70 Q34 60 52 70 T88 70" stroke="#d9b779" strokeWidth="3" fill="none" /> : null,
  },
  {
    id: "snow",
    name: "눈나라",
    robotName: "썰매 로봇",
    goalName: "이글루",
    obstacleName: "얼음 바위",
    bg: "#9cc3db",
    floor: "#f8fafc",
    floorAlt: "#eef4f8",
    grid: "#bcd6e6",
    ui: "#0ea5e9",
    bg2: "#e3f2fb",
    side: "#6f9bb8",
    robot: { body: "#ef4444", trim: "#f8fafc", visor: "#1e293b", eye: "#bae6fd", feature: "beanie" },
    Goal: () => (
      <g>
        <path d="M12 84 Q12 22 50 22 Q88 22 88 84 Z" fill="#fff" stroke="#64748b" strokeWidth="3" />
        <path d="M20 54 L80 54 M14 70 L86 70 M36 22 L36 54 M64 22 L64 54 M50 54 L50 70" stroke="#cbd5e1" strokeWidth="2.5" />
        <path d="M38 84 Q38 62 50 62 Q62 62 62 84 Z" fill="#334155" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <path d="M14 84 L24 40 L46 18 L74 30 L88 62 L80 86 Z" fill="#7dd3fc" stroke="#0c4a6e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M46 18 L50 50 L24 40 M50 50 L88 62 M50 50 L80 86" stroke="#e0f2fe" strokeWidth="3" fill="none" />
      </g>
    ),
    FloorDecor: ({ seed }) =>
      seed % 5 === 2 ? (
        <g fill="#dbeafe">
          <circle cx="26" cy="30" r="3" />
          <circle cx="72" cy="66" r="2.5" />
        </g>
      ) : null,
  },
];

export const THEMES_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const THEME_IDS = THEMES.map((t) => t.id);
export { THEME_IDS as THEME_ID_LIST } from "./themeIds";
