import type { AttemptResult, RecordRow, ResultReason } from "./types";

type Rec = Pick<RecordRow, "playerId" | "solved" | "bestBlocks" | "bestElapsedMs" | "minDistance">;

/**
 * 7절 승패 판정 순서 (시도마다).
 * autoRematches = 이 경기에서 이미 만든 자동 재경기 수 (최대 2).
 */
export function judge(a: Rec, b: Rec, autoRematches: number): AttemptResult {
  const win = (w: Rec, reason: ResultReason): AttemptResult => ({ winnerId: w.playerId, reason, rematch: false, needsTeacher: false });
  const teacher: AttemptResult = { winnerId: null, reason: null, rematch: false, needsTeacher: true };
  if (a.solved && !b.solved) return win(a, "solved");
  if (b.solved && !a.solved) return win(b, "solved");
  if (a.solved && b.solved) {
    if (a.bestBlocks! !== b.bestBlocks!) return win(a.bestBlocks! < b.bestBlocks! ? a : b, "fewer_blocks");
    if (a.bestElapsedMs! !== b.bestElapsedMs!) return win(a.bestElapsedMs! < b.bestElapsedMs! ? a : b, "faster");
    return teacher;
  }
  if (autoRematches < 2) return { winnerId: null, reason: null, rematch: true, needsTeacher: false };
  if (a.minDistance !== b.minDistance) return win(a.minDistance < b.minDistance ? a : b, "distance");
  return teacher;
}
