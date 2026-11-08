import { cellKey, inBounds } from "./map";
import { countBlocks } from "./program";
import { runProgram } from "./run";
import { GameMap, Pos, Program, RunResult } from "./types";

/** 벽을 피해 목적지까지 가는 최단 칸 수 (BFS). 각 칸 key → 거리. 갈 수 없는 칸은 없음. */
export function distanceField(map: GameMap): Map<number, number> {
  const dist = new Map<number, number>();
  const start = cellKey(map.w, map.goal.x, map.goal.y);
  dist.set(start, 0);
  const q: Pos[] = [map.goal];
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    const d = dist.get(cellKey(map.w, x, y))!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const k = cellKey(map.w, nx, ny);
      if (map.walls.has(k) || dist.has(k)) continue;
      dist.set(k, d + 1);
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/** 규칙 8: 거친 칸들 중 목적지까지의 최단 거리의 최솟값 */
export function minDistance(map: GameMap, visited: Pos[], field = distanceField(map)): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const p of visited) {
    const d = field.get(cellKey(map.w, p.x, p.y));
    if (d !== undefined && d < best) best = d;
  }
  return best;
}

export function startDistance(map: GameMap): number {
  return minDistance(map, [map.start]);
}

/** ★1 성공 / ★2 블록 수 ≤ 목표+2 / ★3 블록 수 ≤ 목표 */
export function starsFor(solved: boolean, blocks: number, target: number): 0 | 1 | 2 | 3 {
  if (!solved) return 0;
  if (blocks <= target) return 3;
  if (blocks <= target + 2) return 2;
  return 1;
}

export interface Evaluation {
  solved: boolean;
  blocks: number;
  stars: 0 | 1 | 2 | 3;
  genius: boolean;
  result: RunResult;
}

export function evaluate(map: GameMap, program: Program, target: number): Evaluation {
  const result = runProgram(map, program);
  const blocks = countBlocks(program);
  const solved = result.outcome === "success";
  return { solved, blocks, stars: starsFor(solved, blocks, target), genius: solved && blocks < target, result };
}
