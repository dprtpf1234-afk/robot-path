import "server-only";
/* 로컬 개발·데모용 메모리 저장소. 프로세스 하나 안에서만 유지된다 (Vercel 배포에는 Supabase를 쓴다). */
import type { Effects, LogRow, RunRow, TournamentRow, TournamentState } from "@/tournament/types";
import type { EventRow, RankingRow, SpectatorTokenRow, StageEventRow, Store, ViewerRow } from "./types";

interface DB {
  teachers: Set<string>;
  events: Map<string, EventRow>;
  ranking: Map<string, RankingRow>;
  stats: Map<string, StageEventRow>;
  limits: Map<string, { windowStart: number; count: number }>;
  tournaments: Map<string, TournamentState>;
  runs: RunRow[];
  logs: LogRow[];
  tokens: SpectatorTokenRow[];
  viewers: ViewerRow[];
  anonUsersByTournament: Map<string, Set<string>>;
}

const g = globalThis as unknown as { __robotDb?: DB };
const db: DB = (g.__robotDb ??= {
  teachers: new Set(),
  events: new Map(),
  ranking: new Map(),
  stats: new Map(),
  limits: new Map(),
  tournaments: new Map(),
  runs: [],
  logs: [],
  tokens: [],
  viewers: [],
  anonUsersByTournament: new Map(),
});

const clone = <T>(v: T): T => structuredClone(v);

export function addDevTeacher(userId: string) {
  db.teachers.add(userId);
}

export const memoryStore: Store = {
  async isTeacher(userId) {
    return db.teachers.has(userId);
  },
  async createEvent(e) {
    db.events.set(e.id, clone(e));
  },
  async getEvent(id) {
    return clone(db.events.get(id) ?? null);
  },
  async getEventByCode(code) {
    return clone([...db.events.values()].find((e) => e.code === code) ?? null);
  },
  async listEvents(teacherId) {
    return clone([...db.events.values()].filter((e) => e.teacherId === teacherId).sort((a, b) => b.createdAt - a.createdAt));
  },
  async deleteEventData(eventId) {
    const tids = [...db.tournaments.values()].filter((s) => s.tournament.eventId === eventId).map((s) => s.tournament.id);
    const anon = new Set<string>();
    for (const tid of tids) {
      const s = db.tournaments.get(tid)!;
      for (const p of s.players) anon.add(p.userId);
      for (const v of db.viewers.filter((v) => v.tournamentId === tid)) anon.add(v.userId);
      db.tournaments.delete(tid);
    }
    const tset = new Set(tids);
    db.runs = db.runs.filter((r) => !tset.has(r.tournamentId));
    db.logs = db.logs.filter((l) => !tset.has(l.tournamentId));
    db.tokens = db.tokens.filter((t) => !tset.has(t.tournamentId));
    db.viewers = db.viewers.filter((v) => !tset.has(v.tournamentId));
    for (const [k, r] of db.ranking) if (r.eventId === eventId) db.ranking.delete(k);
    for (const [k, s] of db.stats) if (s.eventId === eventId) db.stats.delete(k);
    for (const k of db.limits.keys()) if (k.includes(eventId)) db.limits.delete(k);
    db.events.delete(eventId);
    return { anonUserIds: [...anon] };
  },
  async getRankingByKey(eventId, keyHash) {
    return clone([...db.ranking.values()].find((r) => r.eventId === eventId && r.entryKeyHash === keyHash) ?? null);
  },
  async saveRanking(row, isNew) {
    const r = clone(row);
    if (isNew) r.displayNo = [...db.ranking.values()].filter((x) => x.eventId === row.eventId).length + 1;
    db.ranking.set(r.id, r);
    return clone(r);
  },
  async listRanking(eventId) {
    return clone([...db.ranking.values()].filter((r) => r.eventId === eventId));
  },
  async getRanking(id) {
    return clone(db.ranking.get(id) ?? null);
  },
  async setRankingHidden(id, hidden) {
    const r = db.ranking.get(id);
    if (r) r.hidden = hidden;
  },
  async deleteRanking(id) {
    db.ranking.delete(id);
  },
  async insertStageEvents(rows) {
    let n = 0;
    for (const r of rows) {
      if (db.stats.has(r.clientEventId)) continue;
      db.stats.set(r.clientEventId, clone(r));
      n++;
    }
    return n;
  },
  async stageEventSummary(eventId) {
    const rows = [...db.stats.values()].filter((r) => r.eventId === eventId);
    return summarize(rows);
  },
  async hit(key, windowSec, limit) {
    const now = Date.now();
    const w = db.limits.get(key);
    if (!w || now - w.windowStart >= windowSec * 1000) {
      db.limits.set(key, { windowStart: now, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= limit;
  },
  async createTournament(t) {
    db.tournaments.set(t.id, { tournament: clone(t), players: [], matches: [], attempts: [], records: [] });
  },
  async getTournamentByCode(joinCode) {
    const s = [...db.tournaments.values()].find((s) => s.tournament.joinCode === joinCode && s.tournament.status !== "finished");
    return clone(s?.tournament ?? null);
  },
  async listTournaments(eventId) {
    return clone([...db.tournaments.values()].filter((s) => s.tournament.eventId === eventId).map((s) => s.tournament));
  },
  async loadState(tid) {
    return clone(db.tournaments.get(tid) ?? null);
  },
  async commitState(before, after, fx) {
    // JS는 한 스레드이므로 이 함수 안(await 없음)은 원자적이다 = 잠금과 같은 효과
    const cur = db.tournaments.get(before.tournament.id);
    if (!cur || cur.tournament.version !== before.tournament.version) return false;
    for (const r of fx.runs) if (db.runs.some((x) => x.attemptId === r.attemptId && x.runId === r.runId)) return false;
    const next = clone(after);
    next.tournament.version = before.tournament.version + 1;
    db.tournaments.set(next.tournament.id, next);
    db.runs.push(...clone(fx.runs));
    db.logs.push(...clone(fx.logs));
    return true;
  },
  async findRun(attemptId, runId) {
    return clone(db.runs.find((r) => r.attemptId === attemptId && r.runId === runId) ?? null);
  },
  async listLogs(tid) {
    return clone(db.logs.filter((l) => l.tournamentId === tid));
  },
  async createSpectatorToken(t) {
    db.tokens.push(clone(t));
  },
  async findSpectatorToken(hash) {
    return clone(db.tokens.find((t) => t.tokenHash === hash) ?? null);
  },
  async listSpectatorTokens(tid) {
    return clone(db.tokens.filter((t) => t.tournamentId === tid));
  },
  async revokeSpectatorTokens(tid, at) {
    for (const t of db.tokens) if (t.tournamentId === tid && !t.revokedAt) t.revokedAt = at;
    db.viewers = db.viewers.filter((v) => v.tournamentId !== tid);
  },
  async addViewer(v) {
    db.viewers = db.viewers.filter((x) => !(x.tournamentId === v.tournamentId && x.userId === v.userId));
    db.viewers.push(clone(v));
  },
  async isViewer(tid, userId, now) {
    const v = db.viewers.find((x) => x.tournamentId === tid && x.userId === userId);
    if (!v || v.expiresAt <= now) return false;
    const tok = db.tokens.find((t) => t.id === v.tokenId);
    return !!tok && !tok.revokedAt && tok.expiresAt > now;
  },
};

export function summarize(rows: StageEventRow[]) {
  const s11 = new Set(rows.filter((r) => r.chapter === 1 && r.stage === 1 && r.type === "start").map((r) => r.playerSession));
  const c11 = new Set(rows.filter((r) => r.chapter === 1 && r.stage === 1 && r.type === "clear").map((r) => r.playerSession));
  const bySession = new Map<string, number>();
  for (const r of rows) if (r.type !== "start") bySession.set(r.playerSession, (bySession.get(r.playerSession) ?? 0) + r.activeMs);
  const vals = [...bySession.values()];
  return {
    started11: s11.size,
    cleared11: [...c11].filter((x) => s11.has(x)).length,
    sessions: new Set(rows.map((r) => r.playerSession)).size,
    avgActiveMs: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
  };
}
