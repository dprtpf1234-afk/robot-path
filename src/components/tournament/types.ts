import type { BracketMatch } from "./Bracket";

export interface THeader {
  id: string;
  name: string;
  status: "lobby" | "running" | "finished";
  joinCode: string;
  preset: string;
  timeLimitSec: number;
  currentRound: number;
  plannedRounds: number;
  championId: string | null;
  championName: string | null;
  survivors: number;
  playerCount: number;
  screenMatchId: string | null;
}

export interface AttemptV {
  id: string;
  attemptNo: number;
  kind: string;
  grade: string;
  layoutId: string | null;
  variant: "orig" | "flipX" | "flipY" | "rot180" | null;
  themeId: string | null;
  status: "ready" | "countdown" | "playing" | "paused" | "judging" | "done";
  startAt: number | null;
  endsAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  result: { winnerId: string | null; reason: string | null; rematch: boolean; needsTeacher: boolean } | null;
}

export interface RecV {
  playerId: string;
  name: string;
  kicked?: boolean;
  solved: boolean;
  bestBlocks?: number | null;
  bestElapsedMs?: number | null;
  minDistance?: number | null;
  runs: number;
  done: boolean;
  lastRunId?: string | null;
  lastProgram?: import("@/engine/types").Program | null;
  lastFinal?: { x: number; y: number; dir: "N" | "E" | "S" | "W" } | null;
  bestProgram?: import("@/engine/types").Program | null;
}

export interface MatchV {
  id: string;
  round: number;
  slot: number;
  winnerId: string | null;
  reason: string | null;
  needsTeacher: boolean;
  confirmed: boolean;
  locked: boolean;
  autoRematches: number;
  attempt: AttemptV | null;
  attempts: number;
  a?: RecV | null;
  b?: RecV | null;
  me?: RecV | null;
  opponent?: RecV | null;
}

export interface LobbyV {
  tournament: THeader;
  me: { id: string; name: string; kicked: boolean; eliminatedRound: number | null };
  players: { id: string; name: string }[];
  bracket: BracketMatch[];
  myMatch: MatchV | null;
  serverNow: number;
}

export const REASON_TEXT: Record<string, string> = {
  solved: "혼자 성공",
  fewer_blocks: "블록 수가 더 적음",
  faster: "더 빨리 성공",
  distance: "목적지에 더 가까이 감",
  teacher: "선생님이 정함",
  bye: "부전승",
  forfeit: "기권",
};

/** 남은 시간(ms). 일시정지 중이면 멈춘 시각 기준 */
export function remainingMs(a: AttemptV | null, now: number): number | null {
  if (!a || a.endsAt === null) return null;
  const ref = a.status === "paused" && a.pausedAt ? a.pausedAt : now;
  return Math.max(0, a.endsAt - ref);
}

export const fmtTime = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
