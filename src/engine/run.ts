import { cellKey, DIR_VEC, isWall, LEFT_OF, RIGHT_OF } from "./map";
import { Block, Dir, GameMap, MAX_EXEC, Outcome, Pos, Program, RunResult, Step } from "./types";

class Stop {
  constructor(
    public outcome: Outcome,
    public path?: number[],
  ) {}
}

export interface RunOptions {
  /** 실행 기록(steps)을 남기지 않는다. 전수 탐색처럼 빠르게 돌릴 때 쓴다. */
  noTrace?: boolean;
  /** 이 상태에서 시작한다 (전수 탐색의 이어서 실행용) */
  from?: { x: number; y: number; dir: Dir; execCount: number };
}

/**
 * 결정론적 실행기. 같은 맵과 같은 프로그램은 항상 같은 결과를 낸다.
 * 규칙 1: 목적지 칸에 들어가는 순간 성공, 즉시 종료.
 * 규칙 2: 벽·맵 밖으로 이동하면 충돌(제자리), 종료.
 * 규칙 3: 실행 1회 = 이동·회전 1번, 조건 검사 1번, 반복 한 바퀴 시작 1번. 501번째 시작 시 지침.
 * 규칙 4: 끝까지 실행했는데 목적지가 아니면 실패.
 */
export function runProgram(map: GameMap, program: Program, opts: RunOptions = {}): RunResult {
  const trace = !opts.noTrace;
  let x = opts.from?.x ?? map.start.x;
  let y = opts.from?.y ?? map.start.y;
  let dir: Dir = opts.from?.dir ?? map.start.dir;
  let execCount = opts.from?.execCount ?? 0;
  const steps: Step[] = [];
  const visited: Pos[] = [{ x, y }];

  const tick = (path: number[]) => {
    if (execCount >= MAX_EXEC) throw new Stop("tired", path);
    execCount++;
  };

  const exec = (blocks: Block[], prefix: number[]) => {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const path = trace ? [...prefix, i] : prefix;
      switch (b.t) {
        case "forward": {
          tick(path);
          const [dx, dy] = DIR_VEC[dir];
          const nx = x + dx;
          const ny = y + dy;
          if (isWall(map, nx, ny)) {
            if (trace) steps.push({ kind: "bump", path, x, y, dir });
            throw new Stop("crash", path);
          }
          x = nx;
          y = ny;
          visited.push({ x, y });
          if (trace) steps.push({ kind: "move", path, x, y, dir });
          if (x === map.goal.x && y === map.goal.y) throw new Stop("success");
          break;
        }
        case "left":
        case "right":
          tick(path);
          dir = b.t === "left" ? LEFT_OF[dir] : RIGHT_OF[dir];
          if (trace) steps.push({ kind: "turn", path, x, y, dir });
          break;
        case "repeat":
          for (let k = 0; k < b.n; k++) {
            tick(path);
            if (trace) steps.push({ kind: "loop", path, iteration: k + 1, x, y, dir });
            exec(b.body, path);
          }
          break;
        case "untilGoal":
          // 목적지에 닿으면 Stop("success")로 빠져나간다. 아니면 지칠 때까지 반복.
          for (let k = 0; ; k++) {
            tick(path);
            if (trace) steps.push({ kind: "loop", path, iteration: k + 1, x, y, dir });
            exec(b.body, path);
          }
        case "ifWall": {
          tick(path);
          const [dx, dy] = DIR_VEC[dir];
          const result = isWall(map, x + dx, y + dy);
          if (trace) steps.push({ kind: "check", path, result, x, y, dir });
          if (result) exec(b.body, path);
          break;
        }
        case "ifColor": {
          tick(path);
          const result = map.colors.get(cellKey(map.w, x, y)) === b.color;
          if (trace) steps.push({ kind: "check", path, result, x, y, dir });
          if (result) exec(b.body, path);
          break;
        }
      }
    }
  };

  let outcome: Outcome = "notArrived";
  let failPath: number[] | undefined;
  try {
    exec(program, []);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    outcome = e.outcome;
    failPath = e.path;
  }
  return { outcome, steps, execCount, final: { x, y, dir }, visited, failPath: outcome === "success" ? undefined : failPath };
}
