"use client";
/* 2.5D 맵: 비스듬히 내려다본 두께 있는 보드 위에 장애물·목적지·로봇이 서 있다.
 * 북쪽(y 감소)은 화면 위쪽 그대로라 「앞으로·돌기」 방향이 헷갈리지 않는다.
 * 물체는 뒤 줄(위)부터 앞 줄(아래) 순서로 그려 가까운 것이 먼 것을 가린다. */
import { useId } from "react";
import type { PlacedLayout } from "@/engine/map";
import type { Dir, Pos } from "@/engine/types";
import type { Theme } from "@/content/themes";
import { COLOR_META } from "./BlockIcon";
import { Robot25 } from "./Robot25";

export interface RobotView {
  x: number;
  y: number;
  dir: Dir;
}

const TW = 100; // 칸 너비
const TH = 70; // 칸 깊이 (기울어 보여 너비보다 짧다)
const SLAB = 30; // 보드 두께
const OVER = 66; // 맨 윗줄 물체가 위로 튀어나올 자리
const PADX = 22;
const FLOOR_Y = TH * 0.6; // 칸 안에서 물체가 서는 바닥 높이

const floorCenter = (x: number, y: number) => ({ cx: x * TW + 50, cy: y * TH + FLOOR_Y });

/** 바닥에 눕힌 방향 화살표 (로봇 앞쪽) */
function arrowPath(dir: Dir) {
  const v = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[dir];
  const off = 40;
  const tipX = 50 + v[0] * (off + 12);
  const tipY = v[1] * (off + 12);
  const baseX = 50 + v[0] * off;
  const baseY = v[1] * off;
  const px = -v[1] * 11;
  const py = v[0] * 11;
  const sq = (y: number) => FLOOR_Y + y * 0.62;
  return `M${tipX} ${sq(tipY)} L${baseX + px} ${sq(baseY + py)} L${baseX - px} ${sq(baseY - py)} Z`;
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
  const uid = useId().replace(/:/g, "");
  const { w, h } = placed;
  const W = w * TW;
  const H = h * TH;
  const wallSet = new Set(placed.walls.map((p) => `${p.x},${p.y}`));
  const colorAt = new Map(placed.colors.map((c) => [`${c.pos.x},${c.pos.y}`, c.color]));

  // 물체(장애물·목적지)를 줄별로 모은다
  type Obj = { key: string; x: number; y: number; kind: "wall" | "goal" };
  const objs: Obj[] = [
    ...placed.walls.map((p) => ({ key: `w${p.x},${p.y}`, x: p.x, y: p.y, kind: "wall" as const })),
    { key: "goal", x: placed.goal.x, y: placed.goal.y, kind: "goal" as const },
  ].sort((a, b) => a.y - b.y || a.x - b.x);
  const back = objs.filter((o) => o.y <= robot.y);
  const front = objs.filter((o) => o.y > robot.y);

  const drawObj = (o: Obj) => {
    const { cx, cy } = floorCenter(o.x, o.y);
    return (
      <g key={o.key}>
        {o.kind === "goal" ? (
          <ellipse cx={cx} cy={cy} rx="42" ry="15" fill="#fde047" className="goal-glow" opacity={anim === "success" ? 0.95 : 0.6} />
        ) : null}
        <ellipse cx={cx} cy={cy + 2} rx="33" ry="10" fill="#000" opacity="0.2" />
        <g transform={`translate(${o.x * TW + 4} ${o.y * TH + FLOOR_Y - 84}) scale(0.92)`}>
          <g className={o.kind === "goal" ? "bob" : undefined}>{o.kind === "goal" ? <theme.Goal /> : <theme.Obstacle />}</g>
        </g>
      </g>
    );
  };

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });
  const sx = placed.start.x;
  const sy = placed.start.y;

  return (
    <svg
      viewBox={`${-PADX} ${-OVER} ${W + PADX * 2} ${H + OVER + SLAB + 22}`}
      className={`block h-full w-full select-none ${className}`}
      role="img"
      aria-label={label ?? `${w}×${h} 격자 맵`}
      style={{ ["--step-ms" as string]: `${stepMs}ms` }}
    >
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.bg2} />
          <stop offset="1" stopColor={theme.bg} />
        </linearGradient>
        <linearGradient id={`slab-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.side} stopOpacity="0.85" />
          <stop offset="1" stopColor={theme.side} />
        </linearGradient>
        <linearGradient id={`tile-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`stripe-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill={COLOR_META.red.fill} />
          <rect width="6" height="16" fill="#fca5a5" />
        </pattern>
        <pattern id={`dots-${uid}`} width="20" height="14" patternUnits="userSpaceOnUse">
          <rect width="20" height="14" fill={COLOR_META.blue.fill} />
          <ellipse cx="10" cy="7" rx="4" ry="3" fill="#93c5fd" />
        </pattern>
      </defs>

      {/* 배경 */}
      <rect x={-PADX} y={-OVER} width={W + PADX * 2} height={H + OVER + SLAB + 22} rx="18" fill={`url(#sky-${uid})`} />

      {/* 보드: 옆면(두께) → 윗면 */}
      <ellipse cx={W / 2} cy={H + SLAB + 8} rx={W / 2 + 10} ry="12" fill="#000" opacity="0.18" />
      <rect x="-12" y={H - 30} width={W + 24} height={SLAB + 38} rx="20" fill={`url(#slab-${uid})`} />
      <rect x="-12" y="-12" width={W + 24} height={H + 24} rx="20" fill={theme.grid} />

      {/* 바닥 칸 */}
      {cells.map(({ x, y }) => {
        const wall = wallSet.has(`${x},${y}`);
        const color = colorAt.get(`${x},${y}`);
        const Decor = theme.FloorDecor;
        const seed = x * 31 + y * 17 + placed.layout.id.length;
        return (
          <g key={`f${x},${y}`} transform={`translate(${x * TW} ${y * TH})`}>
            <rect x="3" y="7" width="94" height={TH - 6} rx="11" fill="#000" opacity="0.22" />
            <rect x="3" y="3" width="94" height={TH - 8} rx="11" fill={(x + y) % 2 ? theme.floorAlt : theme.floor} />
            {wall ? <rect x="3" y="3" width="94" height={TH - 8} rx="11" fill="#000" opacity="0.08" /> : null}
            {color ? (
              <>
                <rect x="8" y="7" width="84" height={TH - 16} rx="9" fill={`url(#${color === "red" ? "stripe" : "dots"}-${uid})`} opacity="0.92" />
                <g transform={`translate(50 ${TH / 2 - 2}) scale(1 0.72)`}>
                  {COLOR_META[color].symbol === "tri" ? (
                    <path d="M0 -18 L18 14 L-18 14 Z" fill="#fff" stroke="#7f1d1d" strokeWidth="3" />
                  ) : (
                    <circle r="15" fill="#fff" stroke="#1e3a8a" strokeWidth="3" />
                  )}
                </g>
              </>
            ) : !wall && Decor ? (
              <g transform={`scale(1 ${TH / 100})`}>
                <Decor seed={seed} />
              </g>
            ) : null}
            <rect x="3" y="3" width="94" height={TH - 8} rx="11" fill={`url(#tile-${uid})`} />
          </g>
        );
      })}

      {/* 시작 칸 표시와 지나온 길 */}
      <ellipse cx={sx * TW + 50} cy={sy * TH + FLOOR_Y} rx="38" ry="14" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="9 7" opacity="0.8" />
      {trail.map((p, i) => (
        <ellipse key={`t${i}`} cx={p.x * TW + 50} cy={p.y * TH + FLOOR_Y} rx="8" ry="5" fill="#fff" opacity="0.6" />
      ))}

      {/* 뒤쪽 물체 → 로봇 → 앞쪽 물체 */}
      {back.map(drawObj)}
      <g className="robot" style={{ transform: `translate(${robot.x * TW}px, ${robot.y * TH}px)` }}>
        <ellipse cx="50" cy={FLOOR_Y + 2} rx="30" ry="10" fill="#000" opacity="0.25" />
        <path d={arrowPath(robot.dir)} fill="#facc15" stroke="#78350f" strokeWidth="2.5" strokeLinejoin="round" />
        <g transform={`translate(5 ${FLOOR_Y - 89}) scale(0.9)`}>
          <g className={anim === "bump" ? "shake" : anim === "success" ? "hop" : ""} style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
            <g key={robot.dir} className="turn-pop" style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
              <Robot25 look={theme.robot} dir={robot.dir} />
            </g>
          </g>
        </g>
      </g>
      {front.map(drawObj)}
    </svg>
  );
}
