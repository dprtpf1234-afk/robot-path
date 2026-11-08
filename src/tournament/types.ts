import type { Dir, Program, Variant } from "@/engine/types";
import type { PlayGrade } from "@/content/grades";

export type Preset = "low" | "all" | "high";
export type AttemptStatus = "ready" | "countdown" | "playing" | "paused" | "judging" | "done";
export type ResultReason = "solved" | "fewer_blocks" | "faster" | "distance" | "teacher" | "bye" | "forfeit";

export interface TournamentRow {
  id: string;
  eventId: string;
  teacherId: string;
  name: string;
  joinCode: string;
  preset: Preset;
  timeLimitSec: number;
  status: "lobby" | "running" | "finished";
  currentRound: number;
  plannedRounds: number;
  startPlayers: number;
  championId: string | null;
  /** 관객 화면이 따라갈 경기 (교사가 고름) */
  screenMatchId: string | null;
  createdAt: number;
  finishedAt: number | null;
  version: number;
}

export interface PlayerRow {
  id: string;
  tournamentId: string;
  userId: string;
  nickname: string;
  displayName: string;
  hadBye: boolean;
  lastByeRound: number | null;
  eliminatedRound: number | null;
  kicked: boolean;
  joinedAt: number;
}

export interface MatchRow {
  id: string;
  tournamentId: string;
  round: number;
  slot: number;
  playerA: string;
  playerB: string | null; // null = 부전승
  currentAttemptId: string | null;
  autoRematches: number;
  winnerId: string | null;
  resultReason: ResultReason | null;
  /** 판정이 끝났지만 교사가 정해야 함 (동점) */
  needsTeacher: boolean;
  confirmed: boolean;
  locked: boolean;
}

export interface AttemptResult {
  winnerId: string | null;
  reason: ResultReason | null;
  rematch: boolean;
  needsTeacher: boolean;
}

export interface AttemptRow {
  id: string;
  matchId: string;
  tournamentId: string;
  attemptNo: number;
  kind: "first" | "auto" | "extra";
  grade: PlayGrade;
  layoutId: string | null;
  variant: Variant | null;
  themeId: string | null;
  contentVersion: number | null;
  status: AttemptStatus;
  startAt: number | null;
  endsAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  result: AttemptResult | null;
  judgedAt: number | null;
  createdAt: number;
}

export interface RecordRow {
  id: string;
  attemptId: string;
  tournamentId: string;
  playerId: string;
  solved: boolean;
  bestBlocks: number | null;
  bestElapsedMs: number | null;
  minDistance: number;
  bestProgram: Program | null;
  runs: number;
  done: boolean;
  lastRunId: string | null;
  lastProgram: Program | null;
  lastFinal: { x: number; y: number; dir: Dir } | null;
  updatedAt: number;
}

export interface RunRow {
  id: string;
  attemptId: string;
  tournamentId: string;
  playerId: string;
  runId: string;
  program: Program;
  receivedAt: number;
  solved: boolean;
  blocks: number;
  minDistance: number;
  outcome: string;
}

export interface LogRow {
  id: string;
  tournamentId: string;
  matchId: string | null;
  attemptId: string | null;
  actor: string;
  action: string;
  reason: string | null;
  createdAt: number;
}

export interface TournamentState {
  tournament: TournamentRow;
  players: PlayerRow[];
  matches: MatchRow[];
  attempts: AttemptRow[];
  records: RecordRow[];
}

/** 상태 변경과 함께 저장할 추가 행 (append-only) */
export interface Effects {
  runs: RunRow[];
  logs: LogRow[];
  broadcasts: { topic: string; event: string; payload: Record<string, unknown> }[];
}

export interface Ctx {
  now: number;
  rng: () => number;
  newId: () => string;
}
