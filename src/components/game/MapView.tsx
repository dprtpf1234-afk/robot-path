"use client";
/* 2.5D 맵 (파스텔 미니멀): 하늘에 떠 있는 한 덩어리 석판 위에 기하학 도형 물체가 서 있다.
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
const SLAB = 34; // 석판 두께
const PILLAR = 64; // 석판 아래 기둥 (하늘로 사라짐)
const OVER = 70; // 맨 윗줄 물체가 위로 튀어나올 자리
const PADX = 26;
const FLOOR_Y = TH * 0.6; // 칸 안에서 물체가 서는 바닥 높이
const INK = "#4b4370"; // 그림자 색

const floorCenter = (x: number, y: number) => ({ cx: x * TW + 50, cy: y * TH + FLOOR_Y });

/** 바닥에 눕힌 방향 표시 (로봇 앞쪽) */
function arrowPath(dir: Dir) {
  const v = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[dir];
  const off = 40;
  const tipX = 50 + v[0] * (off + 11);
  const tipY = v[1] * (off + 11);
  const baseX = 50 + v[0] * off;
  const baseY = v[1] * off;
  const px = -v[1] * 10;
  const py = v[0] * 10;
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
  const colorAt = new Map(placed.colors.map((c) => [`${c.pos.x},${c.pos.y}`, c.color]));
  const wallSet = new Set(placed.walls.map((p) => `${p.x},${p.y}`));

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
          <>
            <ellipse cx={cx} cy={cy} rx="44" ry="16" fill="#fff" className="goal-glow" opacity={anim === "success" ? 1 : 0.7} />
            <ellipse cx={cx} cy={cy} rx="44" ry="16" fill="none" stroke={theme.ui} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
          </>
        ) : null}
        <ellipse cx={cx + 6} cy={cy + 3} rx="32" ry="9" fill={INK} opacity="0.12" />
        <g transform={`translate(${o.x * TW + 4} ${o.y * TH + FLOOR_Y - 84}) scale(0.92)`}>
          <g className={o.kind === "goal" ? "bob" : undefined}>{o.kind === "goal" ? <theme.Goal /> : <theme.Obstacle />}</g>
        </g>
      </g>
    );
  };

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });
  const pillarXs = w >= 7 ? [0.5, w / 2 - 0.5, w - 1.5] : [0.5, w - 1.5];
  const vbH = H + OVER + SLAB + PILLAR + 10;
  const Sky = theme.Sky;

  return (
    <svg
      viewBox={`${-PADX} ${-OVER} ${W + PADX * 2} ${vbH}`}
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
        <linearGradient id={`pillar-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.side} />
          <stop offset="1" stopColor={theme.side} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`pillarR-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.sideDark} />
          <stop offset="1" stopColor={theme.sideDark} stopOpacity="0" />
        </linearGradient>
        <pattern id={`stripe-${uid}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill={COLOR_META.red.fill} />
          <rect width="5" height="14" fill={COLOR_META.red.light} />
        </pattern>
        <pattern id={`dots-${uid}`} width="18" height="13" patternUnits="userSpaceOnUse">
          <rect width="18" height="13" fill={COLOR_META.blue.fill} />
          <ellipse cx="9" cy="6.5" rx="3.5" ry="2.6" fill={COLOR_META.blue.light} />
        </pattern>
      </defs>

      {/* 하늘 */}
      <rect x={-PADX} y={-OVER} width={W + PADX * 2} height={vbH} rx="22" fill={`url(#sky-${uid})`} />
      {Sky ? <Sky w={W} h={H} /> : null}

      {/* 석판 아래 기둥 → 석판 앞면(두께) */}
      {pillarXs.map((px, i) => (
        <g key={`p${i}`}>
          <rect x={px * TW + 20} y={H + SLAB - 4} width="30" height={PILLAR} fill={`url(#pillar-${uid})`} />
          <rect x={px * TW + 50} y={H + SLAB - 4} width="30" height={PILLAR} fill={`url(#pillarR-${uid})`} />
        </g>
      ))}
      <rect x="-8" y={H - 10} width={W + 16} height={SLAB + 10} rx="6" fill={theme.side} />
      {Array.from({ length: w + 1 }, (_, i) => (
        <rect key={`s${i}`} x={i * TW - 1.5} y={H + 4} width="3" height={SLAB - 10} rx="1.5" fill={theme.sideDark} opacity="0.35" />
      ))}

      {/* 석판 윗면 + 칸 */}
      <rect x="-8" y="-8" width={W + 16} height={H + 14} rx="8" fill={theme.grid} />
      {cells.map(({ x, y }) => {
        const color = colorAt.get(`${x},${y}`);
        const wall = wallSet.has(`${x},${y}`);
        const Decor = theme.FloorDecor;
        const seed = x * 31 + y * 17 + placed.layout.id.length;
        return (
          <g key={`f${x},${y}`} transform={`translate(${x * TW} ${y * TH})`}>
            <rect x="2" y="2" width="96" height={TH - 4} rx="5" fill={(x + y) % 2 ? theme.floorAlt : theme.floor} />
            {color ? (
              <>
                <rect x="10" y="8" width="80" height={TH - 16} rx="6" fill={`url(#${color === "red" ? "stripe" : "dots"}-${uid})`} />
                <g transform={`translate(50 ${TH / 2}) scale(1 0.72)`}>
                  {COLOR_META[color].symbol === "tri" ? (
                    <path d="M0 -16 L16 12 L-16 12 Z" fill="#fff" />
                  ) : (
                    <circle r="13" fill="#fff" />
                  )}
                </g>
              </>
            ) : !wall && Decor ? (
              <g transform={`scale(1 ${TH / 100})`}>
                <Decor seed={seed} />
              </g>
            ) : null}
          </g>
        );
      })}

      {/* 시작 칸과 지나온 길 */}
      <ellipse cx={placed.start.x * TW + 50} cy={placed.start.y * TH + FLOOR_Y} rx="36" ry="13" fill="none" stroke={theme.ui} strokeWidth="3" strokeDasharray="8 7" opacity="0.7" />
      {trail.map((p, i) => (
        <ellipse key={`t${i}`} cx={p.x * TW + 50} cy={p.y * TH + FLOOR_Y} rx="6" ry="4" fill={theme.ui} opacity="0.55" />
      ))}

      {/* 뒤쪽 물체 → 로봇 → 앞쪽 물체 */}
      {back.map(drawObj)}
      <g className="robot" style={{ transform: `translate(${robot.x * TW}px, ${robot.y * TH}px)` }}>
        <ellipse cx="56" cy={FLOOR_Y + 3} rx="28" ry="9" fill={INK} opacity="0.14" />
        <path d={arrowPath(robot.dir)} fill={theme.ui} />
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
