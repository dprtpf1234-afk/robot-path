import type { BlockType, LayoutJson } from "@/engine/types";
import { usedBlockTypes, fromCompact } from "@/engine/program";
import { COND_BLOCKS, REPEAT_BLOCKS, SEQ_BLOCKS, ALL_BLOCKS, PlayGrade } from "./grades";
import { ALL_LAYOUTS, LAYOUTS_BY_ID } from "./layouts";

export interface TutorialStep {
  /** 손가락이 가리킬 대상: 팔레트 블록, 반복 숫자, 프로그램 안 그릇, 실행 버튼 */
  target:
    | { kind: "palette"; block: BlockType }
    | { kind: "count"; path: number[]; n: number }
    | { kind: "select"; path: number[] }
    | { kind: "run" };
  text: string;
}

export interface StageSpec {
  chapter: 1 | 2 | 3;
  stage: number; // 1~5
  id: string; // "1-1"
  allowedBlocks: BlockType[];
  maxNesting: number;
  concept: string;
  /** 고정 레이아웃(튜토리얼) 또는 등급 */
  fixedLayout?: string;
  grade?: PlayGrade;
  tutorial?: TutorialStep[];
}

const C1 = SEQ_BLOCKS;
const C2 = REPEAT_BLOCKS;
const C3a: BlockType[] = [...REPEAT_BLOCKS, "ifWall"];
const C3b = COND_BLOCKS;
const C3c = ALL_BLOCKS;

/** 4절 단계 명세 (서버 검증 기준) */
export const STAGES: StageSpec[] = [
  {
    chapter: 1, stage: 1, id: "1-1", allowedBlocks: C1, maxNesting: 0, concept: "순차", fixedLayout: "t1",
    tutorial: [
      { target: { kind: "palette", block: "forward" }, text: "「앞으로」를 눌러요" },
      { target: { kind: "palette", block: "forward" }, text: "한 번 더 눌러요" },
      { target: { kind: "palette", block: "right" }, text: "「오른쪽 돌기」를 눌러요" },
      { target: { kind: "palette", block: "forward" }, text: "「앞으로」를 눌러요" },
      { target: { kind: "run" }, text: "「실행」을 눌러 봐요!" },
    ],
  },
  { chapter: 1, stage: 2, id: "1-2", allowedBlocks: C1, maxNesting: 0, concept: "순차", grade: "D1" },
  { chapter: 1, stage: 3, id: "1-3", allowedBlocks: C1, maxNesting: 0, concept: "순차", grade: "D1" },
  { chapter: 1, stage: 4, id: "1-4", allowedBlocks: C1, maxNesting: 0, concept: "순차", grade: "D2" },
  { chapter: 1, stage: 5, id: "1-5", allowedBlocks: C1, maxNesting: 0, concept: "순차", grade: "D2" },
  {
    chapter: 2, stage: 1, id: "2-1", allowedBlocks: C2, maxNesting: 1, concept: "반복", fixedLayout: "t2",
    tutorial: [
      { target: { kind: "palette", block: "repeat" }, text: "「반복」을 눌러요" },
      { target: { kind: "palette", block: "forward" }, text: "「앞으로」를 넣어요" },
      { target: { kind: "count", path: [0], n: 5 }, text: "숫자를 눌러 5로 바꿔요" },
      { target: { kind: "run" }, text: "「실행」! 블록 2개로 끝!" },
    ],
  },
  { chapter: 2, stage: 2, id: "2-2", allowedBlocks: C2, maxNesting: 1, concept: "반복", grade: "D3" },
  { chapter: 2, stage: 3, id: "2-3", allowedBlocks: C2, maxNesting: 1, concept: "반복", grade: "D3" },
  { chapter: 2, stage: 4, id: "2-4", allowedBlocks: C2, maxNesting: 2, concept: "중첩 반복", grade: "D4" },
  { chapter: 2, stage: 5, id: "2-5", allowedBlocks: C2, maxNesting: 2, concept: "중첩 반복", grade: "D4" },
  {
    chapter: 3, stage: 1, id: "3-1", allowedBlocks: C3a, maxNesting: 2, concept: "조건", fixedLayout: "t3",
    tutorial: [
      { target: { kind: "palette", block: "repeat" }, text: "「반복」을 눌러요" },
      { target: { kind: "count", path: [0], n: 9 }, text: "숫자를 9로 바꿔요" },
      { target: { kind: "palette", block: "ifWall" }, text: "「앞이 막혔다면」을 넣어요" },
      { target: { kind: "palette", block: "right" }, text: "막히면 「오른쪽 돌기」!" },
      { target: { kind: "select", path: [0] }, text: "「반복」 블록을 눌러요" },
      { target: { kind: "palette", block: "forward" }, text: "「앞으로」를 넣어요" },
      { target: { kind: "run" }, text: "「실행」을 눌러 봐요!" },
    ],
  },
  { chapter: 3, stage: 2, id: "3-2", allowedBlocks: C3b, maxNesting: 2, concept: "색 조건", grade: "D5" },
  { chapter: 3, stage: 3, id: "3-3", allowedBlocks: C3b, maxNesting: 2, concept: "색 조건", grade: "D5" },
  { chapter: 3, stage: 4, id: "3-4", allowedBlocks: C3c, maxNesting: 2, concept: "조건 반복", grade: "D6" },
  { chapter: 3, stage: 5, id: "3-5", allowedBlocks: C3c, maxNesting: 2, concept: "조건 반복", grade: "D6" },
];

export const CHAPTERS = [
  { chapter: 1 as const, title: "차례대로", concept: "순차", icon: "➡️" },
  { chapter: 2 as const, title: "되풀이", concept: "반복", icon: "🔁" },
  { chapter: 3 as const, title: "만약에", concept: "조건", icon: "❓" },
];

export function stageById(id: string): StageSpec | undefined {
  return STAGES.find((s) => s.id === id);
}

export function stageOf(chapter: number, stage: number): StageSpec | undefined {
  return STAGES.find((s) => s.chapter === chapter && s.stage === stage);
}

/** 레이아웃이 그 단계의 후보인가 (4절 규칙) */
export function isCandidate(stage: StageSpec, layout: LayoutJson): boolean {
  if (stage.fixedLayout) return layout.id === stage.fixedLayout;
  if (layout.grade !== stage.grade) return false;
  if (layout.maxNesting > stage.maxNesting) return false;
  for (const t of usedBlockTypes(fromCompact(layout.solution))) if (!stage.allowedBlocks.includes(t)) return false;
  return true;
}

export function candidatesFor(stage: StageSpec): LayoutJson[] {
  if (stage.fixedLayout) return [LAYOUTS_BY_ID[stage.fixedLayout]];
  return ALL_LAYOUTS.filter((l) => isCandidate(stage, l));
}
