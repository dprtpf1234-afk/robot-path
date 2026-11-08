import { mirrorTurns, fromCompact } from "./program";
import { Color, Dir, GameMap, LayoutJson, Pos, Program, Variant } from "./types";

export const VARIANTS: readonly Variant[] = ["orig", "flipX", "flipY", "rot180"];

export const DIR_VEC: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const LEFT_OF: Record<Dir, Dir> = { N: "W", W: "S", S: "E", E: "N" };
export const RIGHT_OF: Record<Dir, Dir> = { N: "E", E: "S", S: "W", W: "N" };

export function cellKey(w: number, x: number, y: number): number {
  return y * w + x;
}

export function inBounds(m: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h;
}

export function isWall(m: GameMap, x: number, y: number): boolean {
  return !inBounds(m, x, y) || m.walls.has(cellKey(m.w, x, y));
}

export function transformPos(v: Variant, w: number, h: number, x: number, y: number): [number, number] {
  switch (v) {
    case "orig":
      return [x, y];
    case "flipX":
      return [w - 1 - x, y];
    case "flipY":
      return [x, h - 1 - y];
    case "rot180":
      return [w - 1 - x, h - 1 - y];
  }
}

export function transformDir(v: Variant, d: Dir): Dir {
  const swapEW = (d: Dir): Dir => (d === "E" ? "W" : d === "W" ? "E" : d);
  const swapNS = (d: Dir): Dir => (d === "N" ? "S" : d === "S" ? "N" : d);
  switch (v) {
    case "orig":
      return d;
    case "flipX":
      return swapEW(d);
    case "flipY":
      return swapNS(d);
    case "rot180":
      return swapNS(swapEW(d));
  }
}

/** 변형된 레이아웃 데이터 (화면 표시와 엔진 공용) */
export interface PlacedLayout {
  layout: LayoutJson;
  variant: Variant;
  w: number;
  h: number;
  start: { x: number; y: number; dir: Dir };
  goal: Pos;
  walls: Pos[];
  colors: { pos: Pos; color: Color }[];
}

export function placeLayout(layout: LayoutJson, variant: Variant): PlacedLayout {
  const [w, h] = layout.size;
  const t = (x: number, y: number) => transformPos(variant, w, h, x, y);
  const [sx, sy] = t(layout.start.x, layout.start.y);
  const [gx, gy] = t(layout.goal.x, layout.goal.y);
  const colors: { pos: Pos; color: Color }[] = [];
  for (const color of ["red", "blue"] as const) {
    for (const [x, y] of layout.colors[color]) {
      const [cx, cy] = t(x, y);
      colors.push({ pos: { x: cx, y: cy }, color });
    }
  }
  return {
    layout,
    variant,
    w,
    h,
    start: { x: sx, y: sy, dir: transformDir(variant, layout.start.dir) },
    goal: { x: gx, y: gy },
    walls: layout.walls.map(([x, y]) => {
      const [wx, wy] = t(x, y);
      return { x: wx, y: wy };
    }),
    colors,
  };
}

export function toGameMap(p: PlacedLayout): GameMap {
  const walls = new Set<number>();
  for (const { x, y } of p.walls) walls.add(cellKey(p.w, x, y));
  const colors = new Map<number, Color>();
  for (const c of p.colors) colors.set(cellKey(p.w, c.pos.x, c.pos.y), c.color);
  return { w: p.w, h: p.h, start: p.start, goal: p.goal, walls, colors };
}

export function buildMap(layout: LayoutJson, variant: Variant = "orig"): GameMap {
  return toGameMap(placeLayout(layout, variant));
}

/** 배정된 변형에 맞게 변환한 기준 풀이 (힌트용) */
export function solutionFor(layout: LayoutJson, variant: Variant): Program {
  const p = fromCompact(layout.solution);
  return variant === "flipX" || variant === "flipY" ? mirrorTurns(p) : p;
}
