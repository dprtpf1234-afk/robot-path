// 순수 TypeScript 게임 엔진 타입. React·Supabase를 import하지 않는다.

export type Dir = "N" | "E" | "S" | "W";
export type Color = "red" | "blue";
export type Grade = "T" | "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
export type Variant = "orig" | "flipX" | "flipY" | "rot180";

export type BlockType = "forward" | "left" | "right" | "repeat" | "ifWall" | "ifColor" | "untilGoal";

export const CONTAINER_TYPES: readonly BlockType[] = ["repeat", "ifWall", "ifColor", "untilGoal"];

export type Block =
  | { t: "forward" }
  | { t: "left" }
  | { t: "right" }
  | { t: "repeat"; n: number; body: Block[] }
  | { t: "ifWall"; body: Block[] }
  | { t: "ifColor"; color: Color; body: Block[] }
  | { t: "untilGoal"; body: Block[] };

export type ContainerBlock = Extract<Block, { body: Block[] }>;
export type Program = Block[];

/** 레이아웃 JSON 안의 간결한 풀이 표기 (PRD 5절 예시와 같은 모양) */
export type CompactBlock =
  | "forward"
  | "left"
  | "right"
  | { repeat: number; body: CompactBlock[] }
  | { ifWall: CompactBlock[] }
  | { ifColor: Color; body: CompactBlock[] }
  | { untilGoal: CompactBlock[] };

export interface Pos {
  x: number;
  y: number;
}

export interface LayoutJson {
  id: string;
  contentVersion: number;
  grade: Grade;
  size: [number, number];
  start: { x: number; y: number; dir: Dir };
  goal: Pos;
  walls: [number, number][];
  colors: { red: [number, number][]; blue: [number, number][] };
  allowedBlocks: BlockType[];
  maxNesting: number;
  target: number;
  targetVerified: boolean;
  solution: CompactBlock[];
}

/** 엔진이 바로 쓰는 맵 (변형이 적용된 상태) */
export interface GameMap {
  w: number;
  h: number;
  start: { x: number; y: number; dir: Dir };
  goal: Pos;
  walls: Set<number>; // key = y * w + x
  colors: Map<number, Color>;
}

export type Outcome = "success" | "crash" | "tired" | "notArrived";

/** 실행 기록 한 줄. path는 블록 위치(예: [2, 0] = 최상위 3번째 블록의 0번째 자식) */
export type Step =
  | { kind: "move"; path: number[]; x: number; y: number; dir: Dir }
  | { kind: "turn"; path: number[]; x: number; y: number; dir: Dir }
  | { kind: "bump"; path: number[]; x: number; y: number; dir: Dir }
  | { kind: "check"; path: number[]; result: boolean; x: number; y: number; dir: Dir }
  | { kind: "loop"; path: number[]; iteration: number; x: number; y: number; dir: Dir };

export interface RunResult {
  outcome: Outcome;
  steps: Step[];
  /** 실행 횟수(이동·회전·조건 검사·반복 한 바퀴 시작) */
  execCount: number;
  final: { x: number; y: number; dir: Dir };
  /** 거친 모든 칸 (시작 칸 포함) */
  visited: Pos[];
  /** 충돌·지침이 일어난 블록 위치 */
  failPath?: number[];
}

export const MAX_EXEC = 500;
export const MAX_BLOCKS = 40;
export const MAX_BODY_BYTES = 16 * 1024;
export const ABS_MAX_NESTING = 2;
export const REPEAT_MIN = 2;
export const REPEAT_MAX = 9;
