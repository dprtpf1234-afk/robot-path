/* 테마 6종: 겉모습만 바꾸는 스킨. 모든 그래픽은 직접 그린 SVG.
 * 스타일: 파스텔 미니멀. 테두리 없이 기하학 도형으로 그리고, 빛은 왼쪽 위에서 들어와
 * 오른쪽 면이 한 톤 어둡다(두 톤 음영). 물체는 0~100 상자에 그리고 바닥이 y≈90이다. */
import type { ReactElement } from "react";

export interface RobotLook {
  body: string;
  shade: string; // 몸의 그늘 면
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
  /** 하늘 아래쪽 / 위쪽 */
  bg: string;
  bg2: string;
  /** 바닥 윗면 두 톤(체크) */
  floor: string;
  floorAlt: string;
  /** 칸 사이 이음선 */
  grid: string;
  /** 보드 앞면(두께) */
  side: string;
  /** 보드 아래 기둥·앞면의 그늘 */
  sideDark: string;
  ui: string;
  robot: RobotLook;
  Goal: () => ReactElement;
  Obstacle: () => ReactElement;
  /** 하늘에 떠 있는 작은 장식 (선택) */
  Sky?: (p: { w: number; h: number }) => ReactElement | null;
  /** 길 칸 장식 (아주 작게) */
  FloorDecor?: (p: { seed: number }) => ReactElement | null;
}

const dot = (seed: number, fill: string) =>
  seed % 5 === 0 ? <circle cx={30 + (seed % 40)} cy={34 + ((seed * 7) % 30)} r="3.5" fill={fill} opacity="0.55" /> : null;

export const THEMES: Theme[] = [
  {
    id: "space",
    name: "우주",
    robotName: "탐사 로버",
    goalName: "에너지 크리스털",
    obstacleName: "운석",
    bg: "#b8b2e8",
    bg2: "#f6dcee",
    floor: "#efeafc",
    floorAlt: "#e6e0fa",
    grid: "#d4cbf4",
    side: "#c4b9ef",
    sideDark: "#a598de",
    ui: "#9f8fe0",
    robot: { body: "#fdfbff", shade: "#e3dcf7", trim: "#a796e3", visor: "#4d4878", eye: "#ffd3a1", feature: "antenna" },
    Goal: () => (
      <g>
        <path d="M50 10 L70 46 L50 88 Z" fill="#a8ead9" />
        <path d="M50 10 L30 46 L50 88 Z" fill="#cdf5ea" />
        <path d="M50 10 L70 46 L50 52 L30 46 Z" fill="#e8fbf6" opacity="0.8" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <path d="M22 60 L36 30 L64 26 L80 52 L68 82 L34 84 Z" fill="#cbbff2" />
        <path d="M50 28 L64 26 L80 52 L68 82 L50 84 Z" fill="#b2a3e8" />
        <circle cx="42" cy="54" r="7" fill="#b9acee" />
        <circle cx="62" cy="66" r="5" fill="#9f8edd" />
      </g>
    ),
    Sky: ({ w }) => (
      <g opacity="0.75">
        <circle cx={w - 60} cy={-26} r="22" fill="#fff4f8" />
        <circle cx="40" cy="-34" r="4" fill="#fff" />
        <circle cx={w * 0.45} cy="-44" r="3" fill="#fff" />
        <path d={`M${w * 0.7} -50 l4 8 l-4 8 l-4 -8 Z`} fill="#fff" />
      </g>
    ),
    FloorDecor: ({ seed }) => dot(seed, "#cfc4f3"),
  },
  {
    id: "ocean",
    name: "바다",
    robotName: "잠수정",
    goalName: "보물 상자",
    obstacleName: "산호초",
    bg: "#97cfdc",
    bg2: "#e6f6f2",
    floor: "#eaf7f6",
    floorAlt: "#dff2f2",
    grid: "#c2e4e4",
    side: "#a9d9db",
    sideDark: "#85c2c7",
    ui: "#7cc3cc",
    robot: { body: "#fff6dc", shade: "#f3e2b3", trim: "#f2a983", visor: "#36596a", eye: "#b8f1ff", feature: "periscope" },
    Goal: () => (
      <g>
        <rect x="20" y="48" width="60" height="40" rx="6" fill="#f7c9a6" />
        <rect x="50" y="48" width="30" height="40" rx="6" fill="#ecb48c" />
        <path d="M20 50 Q20 26 50 26 Q80 26 80 50 Z" fill="#fbd9bd" />
        <path d="M50 26 Q80 26 80 50 L50 50 Z" fill="#f2c4a1" />
        <rect x="45" y="46" width="10" height="14" rx="3" fill="#ffe9a8" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="24" y="44" width="16" height="46" rx="8" fill="#f6b8c3" />
        <rect x="42" y="22" width="18" height="68" rx="9" fill="#f3a5b5" />
        <rect x="51" y="22" width="9" height="68" rx="4.5" fill="#e891a3" />
        <rect x="62" y="38" width="15" height="52" rx="7.5" fill="#f6b8c3" />
        <rect x="70" y="38" width="7" height="52" rx="3.5" fill="#ea9cae" />
      </g>
    ),
    Sky: ({ w }) => (
      <g opacity="0.7">
        <circle cx={w - 70} cy="-36" r="6" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx={w - 50} cy="-20" r="3.5" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="50" cy="-30" r="4.5" fill="none" stroke="#fff" strokeWidth="2" />
      </g>
    ),
    FloorDecor: ({ seed }) => dot(seed, "#bfe3e3"),
  },
  {
    id: "town",
    name: "마을",
    robotName: "배달 로봇",
    goalName: "택배 상자",
    obstacleName: "공사 펜스",
    bg: "#f3c9c0",
    bg2: "#fdf1e8",
    floor: "#fbf3ec",
    floorAlt: "#f6ebe2",
    grid: "#ead8cb",
    side: "#e8cdbd",
    sideDark: "#d6b19d",
    ui: "#ef9f8f",
    robot: { body: "#ffffff", shade: "#efe6ee", trim: "#f2a294", visor: "#4a3f58", eye: "#a8e6cf", feature: "cap" },
    Goal: () => (
      <g>
        <path d="M50 30 L80 44 L50 58 L20 44 Z" fill="#f3d7b4" />
        <path d="M20 44 L50 58 L50 90 L20 76 Z" fill="#e8c399" />
        <path d="M80 44 L50 58 L50 90 L80 76 Z" fill="#d9ad80" />
        <path d="M35 37 L65 51" stroke="#fff6e8" strokeWidth="6" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="24" y="36" width="9" height="54" rx="4" fill="#e8cdbd" />
        <rect x="67" y="36" width="9" height="54" rx="4" fill="#d6b19d" />
        <rect x="16" y="42" width="68" height="15" rx="7.5" fill="#f6b09a" />
        <rect x="50" y="42" width="34" height="15" rx="7.5" fill="#ec9a83" />
        <path d="M30 42 L40 42 L33 57 L23 57 Z M54 42 L64 42 L57 57 L47 57 Z" fill="#fff4ec" opacity="0.9" />
        <rect x="16" y="64" width="68" height="11" rx="5.5" fill="#f6b09a" />
        <rect x="50" y="64" width="34" height="11" rx="5.5" fill="#ec9a83" />
      </g>
    ),
    Sky: ({ w }) => (
      <g opacity="0.8">
        <circle cx={w - 64} cy="-30" r="20" fill="#fff3e6" />
        <rect x="40" y="-42" width="56" height="10" rx="5" fill="#fff" opacity="0.7" />
      </g>
    ),
    FloorDecor: ({ seed }) => (seed % 4 === 2 ? <rect x="46" y="28" width="8" height="44" rx="4" fill="#ffffff" opacity="0.7" /> : null),
  },
  {
    id: "forest",
    name: "숲",
    robotName: "탐험 로봇",
    goalName: "길 잃은 동물 친구",
    obstacleName: "나무",
    bg: "#b9dfc1",
    bg2: "#f0f8e6",
    floor: "#eff7e7",
    floorAlt: "#e5f1dc",
    grid: "#d0e6c4",
    side: "#bddcae",
    sideDark: "#9cc78c",
    ui: "#8fcf9f",
    robot: { body: "#fdfdf6", shade: "#e6efdc", trim: "#93cfa2", visor: "#3f5a48", eye: "#fff1a8", feature: "leaf" },
    Goal: () => (
      <g>
        <ellipse cx="38" cy="26" rx="7" ry="18" fill="#fde9e4" />
        <ellipse cx="62" cy="26" rx="7" ry="18" fill="#f5d6cf" />
        <circle cx="50" cy="62" r="26" fill="#fff4f0" />
        <path d="M50 36 A26 26 0 0 1 50 88 Z" fill="#f8e3dc" />
        <circle cx="41" cy="58" r="3.5" fill="#5b4b5e" />
        <circle cx="59" cy="58" r="3.5" fill="#5b4b5e" />
        <ellipse cx="50" cy="67" rx="4" ry="3" fill="#f3a5b5" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="45" y="72" width="10" height="18" rx="3" fill="#d8b594" />
        <path d="M50 8 L76 76 L24 76 Z" fill="#a9dbb0" />
        <path d="M50 8 L76 76 L50 76 Z" fill="#8ccc98" />
      </g>
    ),
    Sky: ({ w }) => (
      <g opacity="0.75">
        <circle cx={w - 58} cy="-28" r="18" fill="#fffbe6" />
        <ellipse cx="70" cy="-34" rx="24" ry="7" fill="#fff" />
      </g>
    ),
    FloorDecor: ({ seed }) => dot(seed, "#c9e3b8"),
  },
  {
    id: "desert",
    name: "사막",
    robotName: "탐사 로봇",
    goalName: "오아시스",
    obstacleName: "선인장",
    bg: "#f4cfa4",
    bg2: "#fff2e0",
    floor: "#fcf1e2",
    floorAlt: "#f8e8d3",
    grid: "#efd8bb",
    side: "#ecd0ab",
    sideDark: "#dcb487",
    ui: "#e9a46f",
    robot: { body: "#fffaf2", shade: "#f2e3cf", trim: "#ecab7c", visor: "#5a4636", eye: "#a9e7ff", feature: "hat" },
    Goal: () => (
      <g>
        <ellipse cx="50" cy="78" rx="36" ry="12" fill="#a9dff0" />
        <ellipse cx="44" cy="76" rx="16" ry="4" fill="#d5f2fa" />
        <rect x="64" y="34" width="5" height="44" rx="2.5" fill="#dcb487" />
        <path d="M66 34 Q50 24 38 34 Q52 32 66 34 Z M66 34 Q82 24 92 34 Q80 32 66 34 Z" fill="#9fd6a8" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <rect x="40" y="16" width="22" height="74" rx="11" fill="#a8dcbf" />
        <rect x="51" y="16" width="11" height="74" rx="5.5" fill="#8ccaa8" />
        <rect x="22" y="40" width="12" height="28" rx="6" fill="#a8dcbf" />
        <rect x="22" y="58" width="22" height="10" rx="5" fill="#a8dcbf" />
        <rect x="68" y="30" width="12" height="26" rx="6" fill="#8ccaa8" />
        <rect x="58" y="48" width="22" height="10" rx="5" fill="#8ccaa8" />
      </g>
    ),
    Sky: ({ w }) => <circle cx={w - 62} cy="-30" r="22" fill="#fff6e8" opacity="0.85" />,
    FloorDecor: ({ seed }) => (seed % 4 === 1 ? <path d="M22 60 Q40 52 58 60 T88 60" stroke="#efd6b6" strokeWidth="3" fill="none" /> : null),
  },
  {
    id: "snow",
    name: "눈나라",
    robotName: "썰매 로봇",
    goalName: "이글루",
    obstacleName: "얼음 바위",
    bg: "#c9dcf1",
    bg2: "#f7f9fd",
    floor: "#ffffff",
    floorAlt: "#f3f7fc",
    grid: "#dde8f4",
    side: "#d3e1f0",
    sideDark: "#b4c9e1",
    ui: "#9ec3e6",
    robot: { body: "#ffffff", shade: "#e8eef7", trim: "#f2a8ba", visor: "#3f4a63", eye: "#c2f0ff", feature: "beanie" },
    Goal: () => (
      <g>
        <path d="M14 88 A36 36 0 0 1 86 88 Z" fill="#ffffff" />
        <path d="M50 52 A36 36 0 0 1 86 88 L50 88 Z" fill="#e3ecf7" />
        <path d="M38 88 A12 12 0 0 1 62 88 Z" fill="#7c8db0" />
      </g>
    ),
    Obstacle: () => (
      <g>
        <path d="M26 88 L40 30 L52 88 Z" fill="#d6e8f8" />
        <path d="M40 30 L52 88 L46 88 Z" fill="#bcd6f0" />
        <path d="M44 88 L62 14 L80 88 Z" fill="#c4def5" />
        <path d="M62 14 L80 88 L62 88 Z" fill="#a8cbec" />
      </g>
    ),
    Sky: ({ w }) => (
      <g opacity="0.85" fill="#fff">
        <circle cx="46" cy="-36" r="3" />
        <circle cx={w * 0.4} cy="-22" r="2.5" />
        <circle cx={w * 0.7} cy="-44" r="3.5" />
        <circle cx={w - 40} cy="-26" r="2.5" />
      </g>
    ),
    FloorDecor: ({ seed }) => dot(seed, "#dbe7f4"),
  },
];

export const THEMES_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const THEME_IDS = THEMES.map((t) => t.id);
export { THEME_IDS as THEME_ID_LIST } from "./themeIds";
