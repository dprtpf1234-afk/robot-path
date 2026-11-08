"use client";
import { useRef } from "react";
import type { PlacedLayout } from "@/engine/map";
import type { Dir, Pos } from "@/engine/types";
import type { Theme } from "@/content/themes";
import { COLOR_META } from "./BlockIcon";

const DIR_DEG: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };

export interface RobotView {
  x: number;
  y: number;
  dir: Dir;
}

export function MapView({
  placed,
  theme,
  robot,
  anim = "idle",
  stepMs = 400,
  trail = [],
  className = "",
  label,
}: {
  placed: PlacedLayout;
  theme: Theme;
  robot: RobotView;
  anim?: "idle" | "bump" | "success";
  stepMs?: number;
  trail?: Pos[];
  className?: string;
  label?: string;
}) {
  const { w, h } = placed;
  // 회전을 누적해 270° → 0° 처럼 한 바퀴 거꾸로 도는 일을 막는다
  const angle = useRef<number>(DIR_DEG[robot.dir]);
  const target = DIR_DEG[robot.dir];
  let delta = (target - (((angle.current % 360) + 360) % 360) + 360) % 360;
  if (delta > 180) delta -= 360;
  angle.current += delta;

  const wallSet = new Set(placed.walls.map((p) => `${p.x},${p.y}`));
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });
  const pad = 6;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w * 100 + pad * 2} ${h * 100 + pad * 2}`}
      className={`block h-full w-full select-none ${className}`}
      role="img"
      aria-label={label ?? `${w}×${h} 격자 맵`}
      style={{ ["--step-ms" as string]: `${stepMs}ms` }}
    >
      <defs>
        <pattern id={`stripe-${placed.layout.id}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill={COLOR_META.red.fill} />
          <rect width="6" height="16" fill="#fca5a5" />
        </pattern>
        <pattern id={`dots-${placed.layout.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill={COLOR_META.blue.fill} />
          <circle cx="10" cy="10" r="4" fill="#93c5fd" />
        </pattern>
      </defs>
      <rect x={-pad} y={-pad} width={w * 100 + pad * 2} height={h * 100 + pad * 2} rx="14" fill={theme.bg} />
      {cells.map(({ x, y }) => {
        const seed = x * 31 + y * 17 + placed.layout.id.length;
        const Decor = theme.FloorDecor;
        return (
          <g key={`f${x},${y}`} transform={`translate(${x * 100} ${y * 100})`}>
            <rect x="2" y="2" width="96" height="96" rx="10" fill={(x + y) % 2 ? theme.floorAlt : theme.floor} />
            {!wallSet.has(`${x},${y}`) && Decor ? <Decor seed={seed} /> : null}
          </g>
        );
      })}
      {placed.colors.map(({ pos, color }) => (
        <g key={`c${pos.x},${pos.y}`} transform={`translate(${pos.x * 100} ${pos.y * 100})`}>
          <rect x="6" y="6" width="88" height="88" rx="10" fill={`url(#${color === "red" ? "stripe" : "dots"}-${placed.layout.id})`} opacity="0.9" />
          {COLOR_META[color].symbol === "tri" ? (
            <path d="M50 30 L68 64 L32 64 Z" fill="#fff" stroke="#7f1d1d" strokeWidth="3" />
          ) : (
            <circle cx="50" cy="50" r="15" fill="#fff" stroke="#1e3a8a" strokeWidth="3" />
          )}
        </g>
      ))}
      {trail.map((p, i) => (
        <circle key={`t${i}`} cx={p.x * 100 + 50} cy={p.y * 100 + 50} r="7" fill="#fff" opacity="0.55" />
      ))}
      {/* 시작 칸 표시 */}
      <rect x={placed.start.x * 100 + 8} y={placed.start.y * 100 + 8} width="84" height="84" rx="12" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="10 8" opacity="0.7" />
      <g transform={`translate(${placed.goal.x * 100} ${placed.goal.y * 100})`}>
        <circle cx="50" cy="50" r="44" fill="#fde047" opacity={anim === "success" ? 0.9 : 0.35} />
        <theme.Goal />
      </g>
      {placed.walls.map((p) => (
        <g key={`w${p.x},${p.y}`} transform={`translate(${p.x * 100} ${p.y * 100})`}>
          <theme.Obstacle />
        </g>
      ))}
      <g className="robot" style={{ transform: `translate(${robot.x * 100}px, ${robot.y * 100}px)` }}>
        <g className={anim === "bump" ? "shake" : ""} style={{ transformOrigin: "50px 50px", transformBox: "view-box" }}>
          <g
            className="robot"
            style={{ transform: `rotate(${angle.current}deg)`, transformOrigin: "50px 50px" }}
          >
            <theme.Robot />
          </g>
        </g>
      </g>
    </svg>
  );
}
