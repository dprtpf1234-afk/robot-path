import type { BlockType, Grade } from "@/engine/types";

export const SEQ_BLOCKS: BlockType[] = ["forward", "left", "right"];
export const REPEAT_BLOCKS: BlockType[] = [...SEQ_BLOCKS, "repeat"];
export const COND_BLOCKS: BlockType[] = [...REPEAT_BLOCKS, "ifWall", "ifColor"];
export const ALL_BLOCKS: BlockType[] = [...COND_BLOCKS, "untilGoal"];

export const GRADES = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;
export type PlayGrade = (typeof GRADES)[number];

/** 5절 난이도 등급표 */
export const GRADE_RULES: Record<Grade, {
  size: [number, number];
  allowedBlocks: BlockType[];
  maxNesting: number;
  targetRange: [number, number];
  count: number;
}> = {
  T: { size: [5, 5], allowedBlocks: ALL_BLOCKS, maxNesting: 2, targetRange: [1, 9], count: 0 },
  D1: { size: [5, 5], allowedBlocks: SEQ_BLOCKS, maxNesting: 0, targetRange: [2, 4], count: 6 },
  D2: { size: [6, 6], allowedBlocks: SEQ_BLOCKS, maxNesting: 0, targetRange: [5, 8], count: 10 },
  D3: { size: [6, 6], allowedBlocks: REPEAT_BLOCKS, maxNesting: 1, targetRange: [3, 6], count: 6 },
  D4: { size: [7, 7], allowedBlocks: REPEAT_BLOCKS, maxNesting: 2, targetRange: [4, 8], count: 10 },
  D5: { size: [7, 7], allowedBlocks: COND_BLOCKS, maxNesting: 2, targetRange: [4, 8], count: 6 },
  D6: { size: [8, 8], allowedBlocks: ALL_BLOCKS, maxNesting: 2, targetRange: [5, 9], count: 6 },
};

export const gradeIndex = (g: PlayGrade) => GRADES.indexOf(g);
