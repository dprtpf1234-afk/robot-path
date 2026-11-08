/**
 * 레이아웃 생성기 (개발자용, 빌드와 무관). 사용법: npm run gen:layouts -- D4 [개수] [seed]
 * 무작위 맵을 만들고 전수 탐색(반복 심화)으로 가장 짧은 풀이를 찾아 목표 블록 수로 쓴다.
 * 결과는 src/content/layouts/<id>.json 에 저장되고, 검증은 scripts/validate-layouts.ts가 다시 한다.
 */
import fs from "node:fs";
import path from "node:path";
import {
  BlockType,
  buildMap,
  CompactBlock,
  Dir,
  fromCompact,
  Grade,
  LayoutJson,
  Program,
  runProgram,
  toCompact,
} from "../src/engine/index";
import { DIR_VEC, LEFT_OF, RIGHT_OF } from "../src/engine/map";
import { findShortest, searchProgram } from "../src/engine/search";
import { GRADE_RULES } from "../src/content/grades";

const OUT = path.join(__dirname, "../src/content/layouts");

let seed = 1;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const DIRS: Dir[] = ["N", "E", "S", "W"];

type Cell = [number, number];
const key = (x: number, y: number) => `${x},${y}`;

interface Draft {
  size: [number, number];
  start: { x: number; y: number; dir: Dir };
  goal: { x: number; y: number };
  walls: Cell[];
  red: Cell[];
  blue: Cell[];
}

function toLayout(id: string, grade: Grade, d: Draft, target: number, verified: boolean, sol: Program): LayoutJson {
  const r = GRADE_RULES[grade];
  const sortCells = (c: Cell[]) => [...c].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return {
    id,
    contentVersion: 1,
    grade,
    size: d.size,
    start: d.start,
    goal: d.goal,
    walls: sortCells(d.walls),
    colors: { red: sortCells(d.red), blue: sortCells(d.blue) },
    allowedBlocks: [...r.allowedBlocks],
    maxNesting: r.maxNesting,
    target,
    targetVerified: verified,
    solution: toCompact(sol),
  };
}

/** 빈 격자에서 경로를 그린다. 각 구간 길이와 돌기 방향을 받는다. 겹치면 null */
function tracePath(w: number, h: number, sx: number, sy: number, dir: Dir, segs: { len: number; turn?: "L" | "R" }[]) {
  let x = sx,
    y = sy,
    d = dir;
  const cells: Cell[] = [[x, y]];
  const seen = new Set([key(x, y)]);
  const turns: { cell: Cell; turn: "L" | "R" }[] = [];
  for (const s of segs) {
    for (let i = 0; i < s.len; i++) {
      x += DIR_VEC[d][0];
      y += DIR_VEC[d][1];
      if (x < 0 || y < 0 || x >= w || y >= h || seen.has(key(x, y))) return null;
      seen.add(key(x, y));
      cells.push([x, y]);
    }
    if (s.turn) {
      turns.push({ cell: [x, y], turn: s.turn });
      d = s.turn === "L" ? LEFT_OF[d] : RIGHT_OF[d];
    }
  }
  return { cells, seen, turns, end: [x, y] as Cell };
}

function sprinkleWalls(w: number, h: number, keep: Set<string>, density: number): Cell[] {
  const walls: Cell[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (!keep.has(key(x, y)) && rand() < density) walls.push([x, y]);
  return walls;
}

function draftFor(grade: Grade): Draft | null {
  const r = GRADE_RULES[grade];
  const [w, h] = r.size;
  const sx = ri(0, w - 1),
    sy = ri(0, h - 1),
    dir = pick(DIRS);
  if (grade === "D1" || grade === "D2") {
    const nseg = grade === "D1" ? ri(1, 2) : ri(2, 4);
    const segs = Array.from({ length: nseg }, (_, i) => ({
      len: ri(1, grade === "D1" ? 3 : 3),
      turn: i < nseg - 1 ? pick(["L", "R"] as const) : undefined,
    }));
    const p = tracePath(w, h, sx, sy, dir, segs);
    if (!p) return null;
    return {
      size: [w, h],
      start: { x: sx, y: sy, dir },
      goal: { x: p.end[0], y: p.end[1] },
      walls: sprinkleWalls(w, h, p.seen, grade === "D1" ? 0.25 : 0.35),
      red: [],
      blue: [],
    };
  }
  if (grade === "D3") {
    // 긴 직선 구간 2~3개 → 반복이 쓸모 있음
    const nseg = ri(2, 3);
    const segs = Array.from({ length: nseg }, (_, i) => ({
      len: ri(3, 5),
      turn: i < nseg - 1 ? pick(["L", "R"] as const) : undefined,
    }));
    const p = tracePath(w, h, sx, sy, dir, segs);
    if (!p) return null;
    return { size: [w, h], start: { x: sx, y: sy, dir }, goal: { x: p.end[0], y: p.end[1] }, walls: sprinkleWalls(w, h, p.seen, 0.3), red: [], blue: [] };
  }
  if (grade === "D4") {
    // 같은 무늬를 여러 번 되풀이 → 중첩 반복이 쓸모 있음
    const a = ri(1, 3),
      b = ri(1, 3),
      t1 = pick(["L", "R"] as const),
      t2 = pick(["L", "R"] as const),
      k = ri(2, 4);
    const unit = rand() < 0.5 ? [{ len: a, turn: t1 }] : [{ len: a, turn: t1 }, { len: b, turn: t2 }];
    const segs = Array.from({ length: k }, () => unit).flat();
    segs[segs.length - 1] = { len: segs[segs.length - 1].len, turn: undefined as unknown as "L" };
    if (rand() < 0.5) segs.push({ len: ri(1, 2), turn: undefined as unknown as "L" });
    const p = tracePath(w, h, sx, sy, dir, segs);
    if (!p || p.cells.length < 8) return null;
    return { size: [w, h], start: { x: sx, y: sy, dir }, goal: { x: p.end[0], y: p.end[1] }, walls: sprinkleWalls(w, h, p.seen, 0.35), red: [], blue: [] };
  }
  // D5·D6: 구간 길이가 제각각인 경로 + 돌 곳에 색 / 벽
  const nseg = grade === "D5" ? ri(4, 6) : ri(5, 8);
  const segs = Array.from({ length: nseg }, (_, i) => ({
    len: ri(1, 4),
    turn: i < nseg - 1 ? pick(["L", "R"] as const) : undefined,
  }));
  const p = tracePath(w, h, sx, sy, dir, segs);
  if (!p || p.cells.length < 10) return null;
  const red: Cell[] = [],
    blue: Cell[] = [];
  const style = rand();
  for (const t of p.turns) {
    // 색으로 돌 곳을 알려주거나(색 조건), 벽으로만 알려준다(벽 조건)
    if (style < 0.6 || rand() < 0.5) (t.turn === "L" ? red : blue).push(t.cell);
  }
  // 경로 옆 칸은 대부분 벽으로 막아 "앞이 막혔다면"이 쓸모 있게
  const keep = new Set(p.seen);
  const walls: Cell[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (keep.has(key(x, y))) continue;
      const nearPath = p.cells.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) === 1);
      if (rand() < (nearPath ? 0.8 : 0.3)) walls.push([x, y]);
    }
  return { size: [w, h], start: { x: sx, y: sy, dir }, goal: { x: p.end[0], y: p.end[1] }, walls, red, blue };
}

const SEQ: BlockType[] = ["forward", "left", "right"];
const REP: BlockType[] = [...SEQ, "repeat"];
const COND: BlockType[] = [...REP, "ifWall", "ifColor"];

function evaluateDraft(grade: Grade, d: Draft, deadlineMs: number) {
  const r = GRADE_RULES[grade];
  const fake = toLayout("tmp", grade, d, 0, false, []);
  const map = buildMap(fake);
  const deadline = Date.now() + deadlineMs;
  const best = findShortest(map, { allowedBlocks: r.allowedBlocks, maxNesting: r.maxNesting, limit: r.targetRange[1], deadline });
  if (!best.program || !best.complete) return null;
  const t = best.size;
  if (t < r.targetRange[0] || t > r.targetRange[1]) return null;
  // 개념이 쓸모 있어야 한다: 바로 아래 개념으로는 목표 안에 풀리지 않아야 함
  const lower = (blocks: BlockType[], nesting: number, slack: number) => {
    const s = searchProgram(map, { allowedBlocks: blocks, maxNesting: nesting, maxBlocks: t + slack, deadline: Date.now() + 20000 });
    return s.complete && !s.found;
  };
  const hasTurn = JSON.stringify(best.program).includes("left") || JSON.stringify(best.program).includes("right");
  if ((grade === "D1" || grade === "D2") && !hasTurn) return null;
  if (grade === "D2" && t < 6 && rand() < 0.5) return null;
  if (grade === "D3" && !lower(SEQ, 0, 2)) return null;
  if (grade === "D4" && !lower(REP, 1, 0)) return null;
  if (grade === "D5") {
    if (!lower(REP, 2, 0)) return null;
    if (!lower(SEQ, 0, 4)) return null;
  }
  if (grade === "D6") {
    if (!lower(COND, 2, 0)) return null;
    if (!lower(SEQ, 0, 4)) return null;
  }
  return { target: t, program: best.program };
}

function similar(a: Draft, existing: LayoutJson[]) {
  return existing.some(
    (l) => l.start.x === a.start.x && l.start.y === a.start.y && l.goal.x === a.goal.x && l.goal.y === a.goal.y,
  );
}

function main() {
  const grade = process.argv[2] as Grade;
  const count = Number(process.argv[3] ?? GRADE_RULES[grade].count);
  seed = Number(process.argv[4] ?? 7) * 7919 + grade.charCodeAt(1);
  const made: LayoutJson[] = [];
  let tries = 0;
  while (made.length < count && tries < 200000) {
    tries++;
    const d = draftFor(grade);
    if (!d || similar(d, made)) continue;
    const res = evaluateDraft(grade, d, 30000);
    if (!res) continue;
    const id = `${grade.toLowerCase()}-${String(made.length + 1).padStart(2, "0")}`;
    const layout = toLayout(id, grade, d, res.target, true, res.program);
    // 안전 확인
    if (runProgram(buildMap(layout), fromCompact(layout.solution as CompactBlock[])).outcome !== "success") continue;
    made.push(layout);
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(layout, null, 2) + "\n");
    console.log(`${id} target=${res.target} tries=${tries}`, JSON.stringify(layout.solution));
  }
}

main();
