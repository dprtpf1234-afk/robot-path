/* 행 변환 도우미 (Supabase 저장소·SQL 검증 스크립트 공용). 최상위 키만 snake_case ↔ camelCase로 바꾼다. */
import type { Effects, TournamentState } from "@/tournament/types";

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toRow(o: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]));
}

const BIGINT_KEYS = /(_at|_ms)$/;
export function fromRow<T>(o: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[camel(k)] = typeof v === "string" && BIGINT_KEYS.test(k) && /^\d+$/.test(v) ? Number(v) : v;
  return out as T;
}

export function diffRows<T extends { id: string }>(before: T[], after: T[]) {
  const b = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const changed = after.filter((r) => b.get(r.id) !== JSON.stringify(r));
  const ids = new Set(after.map((r) => r.id));
  const deleted = before.filter((r) => !ids.has(r.id)).map((r) => r.id);
  return { changed: changed.map(toRow), deleted };
}

/** commit_tournament(p jsonb)에 넘길 값 */
export function commitPayload(before: TournamentState, after: TournamentState, fx: Effects) {
  return {
    expected_version: before.tournament.version,
    tournament: toRow(after.tournament),
    players: diffRows(before.players, after.players),
    matches: diffRows(before.matches, after.matches),
    attempts: diffRows(before.attempts, after.attempts),
    records: diffRows(before.records, after.records),
    runs: fx.runs.map(toRow),
    logs: fx.logs.map(toRow),
  };
}
