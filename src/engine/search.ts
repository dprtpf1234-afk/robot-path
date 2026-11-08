import { runProgram } from "./run";
import { Block, BlockType, Color, Dir, GameMap, Program, REPEAT_MAX, REPEAT_MIN } from "./types";

/**
 * 전수 탐색기: allowedBlocks·maxNesting 안에서 블록 수 maxBlocks 이하로 성공하는 프로그램이 있는지 찾는다.
 *
 * 탐색은 "최상위 단위(블록 하나 또는 그릇 하나)를 하나씩 이어 붙이며 그 자리에서 실행"하는 방식이다.
 * 최상위는 순서대로 실행되므로 앞부분의 실행 결과(위치·방향·실행 횟수)를 이어 쓸 수 있고,
 * 같은 상태에 더 적은 남은 블록으로 다시 오면 건너뛴다(지배 관계). 동치 변환으로 줄일 수 있는
 * 모양(왼·오 연속, 같은 돌기 3번, 돌기만 담은 반복 등)은 만들지 않는다. 이 가지치기는 모두
 * "같은 맵에서 블록 수가 같거나 적은 다른 프로그램이 똑같이 동작한다"는 이유로만 한다.
 */

interface Unit {
  block: Block;
  size: number;
  hasForward: boolean;
  turnOnly: boolean;
}

export interface SearchOptions {
  allowedBlocks: readonly BlockType[];
  maxNesting: number;
  maxBlocks: number;
  deadline?: number; // Date.now() 기준 ms
}

export interface SearchResult {
  found: Program | null;
  /** 시간 안에 모든 경우를 다 봤는가 */
  complete: boolean;
}

class Timeout extends Error {}

export class Searcher {
  private seqCache = new Map<string, Unit[][]>();
  private unitCache = new Map<string, Unit[]>();
  private ticks = 0;

  constructor(private opts: SearchOptions) {}

  private checkTime() {
    if (this.opts.deadline && ++this.ticks % 2048 === 0 && Date.now() > this.opts.deadline) throw new Timeout();
  }

  private allows(t: BlockType) {
    return this.opts.allowedBlocks.includes(t);
  }

  /** 정확히 size 크기인 단위들. depthLeft = 더 넣을 수 있는 그릇 깊이 */
  units(size: number, depthLeft: number): Unit[] {
    const key = `${size}:${depthLeft}`;
    const hit = this.unitCache.get(key);
    if (hit) return hit;
    const out: Unit[] = [];
    if (size === 1) {
      for (const t of ["forward", "left", "right"] as const) {
        if (this.allows(t)) out.push({ block: { t }, size: 1, hasForward: t === "forward", turnOnly: t !== "forward" });
      }
    } else if (depthLeft > 0) {
      for (const body of this.seqs(size - 1, depthLeft - 1)) {
        this.checkTime();
        const blocks = body.map((u) => u.block);
        const hasForward = body.some((u) => u.hasForward);
        const turnOnly = body.every((u) => u.turnOnly);
        // 반복 안이 돌기뿐이면 돌기 2개 이하로 바꿀 수 있다
        if (this.allows("repeat") && !turnOnly) {
          for (let n = REPEAT_MIN; n <= REPEAT_MAX; n++)
            out.push({ block: { t: "repeat", n, body: blocks }, size, hasForward, turnOnly: false });
        }
        if (this.allows("ifWall")) out.push({ block: { t: "ifWall", body: blocks }, size, hasForward, turnOnly: false });
        if (this.allows("ifColor")) {
          for (const color of ["red", "blue"] as Color[])
            out.push({ block: { t: "ifColor", color, body: blocks }, size, hasForward, turnOnly: false });
        }
        // 앞으로가 없는 '도착할 때까지 반복'은 항상 지친다
        if (this.allows("untilGoal") && hasForward)
          out.push({ block: { t: "untilGoal", body: blocks }, size, hasForward, turnOnly: false });
      }
    }
    this.unitCache.set(key, out);
    return out;
  }

  /** 정확히 size 크기인 단위 나열(그릇 안 내용). 돌기 표준형만 만든다. */
  seqs(size: number, depthLeft: number): Unit[][] {
    const key = `${size}:${depthLeft}`;
    const hit = this.seqCache.get(key);
    if (hit) return hit;
    const out: Unit[][] = [];
    const cur: Unit[] = [];
    const rec = (left: number) => {
      if (left === 0) {
        out.push(cur.slice());
        return;
      }
      for (let s = 1; s <= left; s++) {
        for (const u of this.units(s, depthLeft)) {
          if (!canAppendTurn(cur, u)) continue;
          cur.push(u);
          rec(left - s);
          cur.pop();
        }
      }
    };
    rec(size);
    this.seqCache.set(key, out);
    return out;
  }

  search(map: GameMap): SearchResult {
    const { maxBlocks, maxNesting } = this.opts;
    const memo = new Map<number, [number, number][]>();
    const stack: Block[] = [];
    let found: Program | null = null;

    const dominated = (x: number, y: number, dir: Dir, rem: number, exec: number) => {
      const k = (y * map.w + x) * 4 + "NESW".indexOf(dir);
      const list = memo.get(k);
      if (list) {
        for (const [r, e] of list) if (r >= rem && e <= exec) return true;
        list.push([rem, exec]);
      } else memo.set(k, [[rem, exec]]);
      return false;
    };

    const dfs = (x: number, y: number, dir: Dir, exec: number, rem: number, prevTurns: Unit[]): boolean => {
      for (let s = 1; s <= rem; s++) {
        for (const u of this.units(s, maxNesting)) {
          this.checkTime();
          // 최상위에서 앞으로가 없는 그릇은 그 상태에서의 회전 하나로 바꿀 수 있다
          if (s > 1 && !u.hasForward) continue;
          if (u.turnOnly && !canAppendTurn(prevTurns, u)) continue;
          // 남은 블록을 다 쓰는 마지막 단위는 앞으로를 포함해야 한다 (성공은 이동에서만 난다)
          if (s === rem && !u.hasForward) continue;
          const r = runProgram(map, [u.block], { noTrace: true, from: { x, y, dir, execCount: exec } });
          if (r.outcome === "success") {
            stack.push(u.block);
            found = stack.slice();
            return true;
          }
          if (r.outcome !== "notArrived") continue;
          const nrem = rem - s;
          if (nrem === 0) continue;
          const f = r.final;
          if (dominated(f.x, f.y, f.dir, nrem, r.execCount)) continue;
          stack.push(u.block);
          if (dfs(f.x, f.y, f.dir, r.execCount, nrem, u.turnOnly ? [...prevTurns, u] : [])) return true;
          stack.pop();
        }
      }
      return false;
    };

    try {
      dominated(map.start.x, map.start.y, map.start.dir, maxBlocks, 0);
      dfs(map.start.x, map.start.y, map.start.dir, 0, maxBlocks, []);
      return { found, complete: true };
    } catch (e) {
      if (e instanceof Timeout) return { found, complete: false };
      throw e;
    }
  }
}

/** 돌기 표준형: 왼·오 연속 금지, 오·오 대신 왼·왼, 같은 돌기 3번 금지 */
function canAppendTurn(cur: Unit[], u: Unit): boolean {
  const t = u.block.t;
  if (t !== "left" && t !== "right") return true;
  const prev = cur[cur.length - 1]?.block.t;
  if (prev === "left" && t === "right") return false;
  if (prev === "right" && (t === "left" || t === "right")) return false;
  if (prev === "left" && t === "left" && cur[cur.length - 2]?.block.t === "left") return false;
  return true;
}

export function searchProgram(map: GameMap, opts: SearchOptions): SearchResult {
  return new Searcher(opts).search(map);
}

/** 반복 심화로 가장 짧은 풀이를 찾는다. complete=false면 그 크기까지만 확인한 것. */
export function findShortest(
  map: GameMap,
  opts: Omit<SearchOptions, "maxBlocks"> & { limit: number },
): { program: Program | null; size: number; complete: boolean } {
  for (let k = 1; k <= opts.limit; k++) {
    const r = new Searcher({ ...opts, maxBlocks: k }).search(map);
    if (r.found) return { program: r.found, size: k, complete: true };
    if (!r.complete) return { program: null, size: k, complete: false };
  }
  return { program: null, size: opts.limit, complete: true };
}
