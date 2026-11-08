import type { Effects, LogRow, RunRow, TournamentRow, TournamentState } from "@/tournament/types";

export interface EventRow {
  id: string;
  teacherId: string;
  name: string;
  code: string; // 영문 대문자 5자
  createdAt: number;
}

export interface StageResult {
  chapter: number;
  stage: number;
  layoutId: string;
  variant: string;
  contentVersion: number;
  program: unknown;
  stars: number;
  blocks: number;
  target: number;
  /** 목표보다 적게 푼 풀이 (개발자가 목표값을 고칠 수 있게) */
  genius?: boolean;
}

export interface RankingRow {
  id: string;
  eventId: string;
  entryKeyHash: string;
  playerSession: string;
  displayNo: number;
  nickname: string;
  totalStars: number;
  stagesCleared: number;
  excessBlocks: number;
  stageResults: Record<string, StageResult>; // "1-2" → 결과
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StageEventRow {
  id: string;
  eventId: string | null;
  playerSession: string;
  clientEventId: string;
  type: "start" | "clear" | "quit";
  chapter: number;
  stage: number;
  grade: string;
  activeMs: number;
  createdAt: number;
}

export interface SpectatorTokenRow {
  id: string;
  tokenHash: string;
  tournamentId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface ViewerRow {
  tournamentId: string;
  userId: string;
  tokenId: string;
  expiresAt: number;
}

export interface Store {
  isTeacher(userId: string): Promise<boolean>;

  createEvent(e: EventRow): Promise<void>;
  getEvent(id: string): Promise<EventRow | null>;
  getEventByCode(code: string): Promise<EventRow | null>;
  listEvents(teacherId: string): Promise<EventRow[]>;
  /** 행사 데이터 전부 삭제. 그 행사에서 만들어진 익명 사용자 id를 돌려준다. */
  deleteEventData(eventId: string): Promise<{ anonUserIds: string[] }>;

  getRankingByKey(eventId: string, keyHash: string): Promise<RankingRow | null>;
  /** 새 항목이면 displayNo를 붙여 넣는다 */
  saveRanking(row: RankingRow, isNew: boolean): Promise<RankingRow>;
  listRanking(eventId: string): Promise<RankingRow[]>;
  getRanking(id: string): Promise<RankingRow | null>;
  setRankingHidden(id: string, hidden: boolean): Promise<void>;
  deleteRanking(id: string): Promise<void>;

  insertStageEvents(rows: StageEventRow[]): Promise<number>;
  stageEventSummary(eventId: string): Promise<{ started11: number; cleared11: number; sessions: number; avgActiveMs: number }>;

  /** 고정 창 요청 제한. 허용이면 true */
  hit(key: string, windowSec: number, limit: number): Promise<boolean>;

  createTournament(t: TournamentRow): Promise<void>;
  getTournamentByCode(joinCode: string): Promise<TournamentRow | null>;
  listTournaments(eventId: string): Promise<TournamentRow[]>;
  loadState(tournamentId: string): Promise<TournamentState | null>;
  /** 버전이 expectedVersion일 때만 저장하고 버전을 올린다. 충돌이면 false */
  commitState(before: TournamentState, after: TournamentState, fx: Effects): Promise<boolean>;
  findRun(attemptId: string, runId: string): Promise<RunRow | null>;
  listLogs(tournamentId: string): Promise<LogRow[]>;

  createSpectatorToken(t: SpectatorTokenRow): Promise<void>;
  findSpectatorToken(tokenHash: string): Promise<SpectatorTokenRow | null>;
  listSpectatorTokens(tournamentId: string): Promise<SpectatorTokenRow[]>;
  revokeSpectatorTokens(tournamentId: string, at: number): Promise<void>;
  addViewer(v: ViewerRow): Promise<void>;
  isViewer(tournamentId: string, userId: string, now: number): Promise<boolean>;
}
