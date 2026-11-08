import {
  ABS_MAX_NESTING,
  Block,
  BlockType,
  CompactBlock,
  MAX_BLOCKS,
  Program,
  REPEAT_MAX,
  REPEAT_MIN,
} from "./types";

export function isContainer(b: Block): b is Extract<Block, { body: Block[] }> {
  return "body" in b;
}

/** 블록 수 = 모든 블록 개수 (그릇 1개 + 안의 블록 각 1개). 반복 횟수는 세지 않는다. */
export function countBlocks(program: Program): number {
  let n = 0;
  for (const b of program) {
    n += 1;
    if (isContainer(b)) n += countBlocks(b.body);
  }
  return n;
}

/** 최대 중첩 깊이. 최상위 그릇 = 1, 그 안의 그릇 = 2. 그릇이 없으면 0. */
export function nestingDepth(program: Program): number {
  let d = 0;
  for (const b of program) {
    if (isContainer(b)) d = Math.max(d, 1 + nestingDepth(b.body));
  }
  return d;
}

/** 안이 비어 있는 첫 그릇의 위치. 없으면 null. */
export function findEmptyContainer(program: Program, prefix: number[] = []): number[] | null {
  for (let i = 0; i < program.length; i++) {
    const b = program[i];
    if (isContainer(b)) {
      if (b.body.length === 0) return [...prefix, i];
      const inner = findEmptyContainer(b.body, [...prefix, i]);
      if (inner) return inner;
    }
  }
  return null;
}

export function usedBlockTypes(program: Program, acc = new Set<BlockType>()): Set<BlockType> {
  for (const b of program) {
    acc.add(b.t);
    if (isContainer(b)) usedBlockTypes(b.body, acc);
  }
  return acc;
}

export type ProgramError =
  | { code: "malformed"; message: string }
  | { code: "tooManyBlocks"; message: string }
  | { code: "tooDeep"; message: string }
  | { code: "notAllowed"; message: string; block: BlockType }
  | { code: "emptyContainer"; message: string; path: number[] };

/**
 * 알 수 없는 입력(JSON)을 엄격하게 파싱한다. 모양이 틀리면 null.
 * 서버는 클라이언트가 보낸 프로그램을 반드시 이 함수로 다시 만든다.
 */
export function parseProgram(input: unknown, depth = 0): Program | null {
  if (!Array.isArray(input)) return null;
  if (depth > ABS_MAX_NESTING) return null;
  const out: Program = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const keys = Object.keys(r);
    switch (r.t) {
      case "forward":
      case "left":
      case "right":
        if (keys.length !== 1) return null;
        out.push({ t: r.t });
        break;
      case "repeat": {
        if (keys.length !== 3) return null;
        const n = r.n;
        if (typeof n !== "number" || !Number.isInteger(n) || n < REPEAT_MIN || n > REPEAT_MAX) return null;
        const body = parseProgram(r.body, depth + 1);
        if (!body) return null;
        out.push({ t: "repeat", n, body });
        break;
      }
      case "ifWall":
      case "untilGoal": {
        if (keys.length !== 2) return null;
        const body = parseProgram(r.body, depth + 1);
        if (!body) return null;
        out.push({ t: r.t, body });
        break;
      }
      case "ifColor": {
        if (keys.length !== 3) return null;
        if (r.color !== "red" && r.color !== "blue") return null;
        const body = parseProgram(r.body, depth + 1);
        if (!body) return null;
        out.push({ t: "ifColor", color: r.color, body });
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

/** 규칙 5·6: 빈 그릇, 크기, 중첩, 허용 블록 검사. 통과하면 null. */
export function checkProgram(
  program: Program,
  rules: { allowedBlocks: readonly BlockType[]; maxNesting: number },
): ProgramError | null {
  const total = countBlocks(program);
  if (total > MAX_BLOCKS) return { code: "tooManyBlocks", message: `블록은 ${MAX_BLOCKS}개까지 놓을 수 있어요` };
  if (nestingDepth(program) > Math.min(rules.maxNesting, ABS_MAX_NESTING))
    return { code: "tooDeep", message: "그릇 안에 그릇을 더 넣을 수 없어요" };
  for (const t of usedBlockTypes(program)) {
    if (!rules.allowedBlocks.includes(t)) return { code: "notAllowed", message: "이 단계에서 쓸 수 없는 블록이에요", block: t };
  }
  const empty = findEmptyContainer(program);
  if (empty) return { code: "emptyContainer", message: "안에 블록을 넣어 주세요", path: empty };
  return null;
}

export function fromCompact(c: CompactBlock[]): Program {
  return c.map((b): Block => {
    if (b === "forward" || b === "left" || b === "right") return { t: b };
    if ("repeat" in b) return { t: "repeat", n: b.repeat, body: fromCompact(b.body) };
    if ("ifWall" in b) return { t: "ifWall", body: fromCompact(b.ifWall) };
    if ("ifColor" in b) return { t: "ifColor", color: b.ifColor, body: fromCompact(b.body) };
    return { t: "untilGoal", body: fromCompact(b.untilGoal) };
  });
}

export function toCompact(p: Program): CompactBlock[] {
  return p.map((b): CompactBlock => {
    switch (b.t) {
      case "forward":
      case "left":
      case "right":
        return b.t;
      case "repeat":
        return { repeat: b.n, body: toCompact(b.body) };
      case "ifWall":
        return { ifWall: toCompact(b.body) };
      case "ifColor":
        return { ifColor: b.color, body: toCompact(b.body) };
      case "untilGoal":
        return { untilGoal: toCompact(b.body) };
    }
  });
}

/** 풀이의 돌기를 좌우로 바꾼다 (좌우·상하 반전 변형용) */
export function mirrorTurns(p: Program): Program {
  return p.map((b): Block => {
    if (b.t === "left") return { t: "right" };
    if (b.t === "right") return { t: "left" };
    if (isContainer(b)) return { ...b, body: mirrorTurns(b.body) } as Block;
    return b;
  });
}

export function programKey(p: Program): string {
  return JSON.stringify(toCompact(p));
}
