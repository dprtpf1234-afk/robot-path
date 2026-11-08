/**
 * 토너먼트 상태 기계 (순수 TS). 서버 API가 대회 상태 전체를 읽어 이 함수들로 바꾸고,
 * 버전 검사(낙관적 잠금)와 함께 한 트랜잭션으로 저장한다. 시각·난수·id는 Ctx로 받는다.
 */
import { buildMap } from "@/engine/map";
import { checkProgram, countBlocks } from "@/engine/program";
import { runProgram } from "@/engine/run";
import { distanceField, minDistance, startDistance } from "@/engine/score";
import type { LayoutJson, Program } from "@/engine/types";
import { LAYOUTS_BY_ID, ALL_LAYOUTS } from "@/content/layouts";
import { easierGrade, gradeForRound, pairRound, roundsFor } from "./bracket";
import { judge } from "./judge";
import { assignMap } from "./maps";
import type {
  AttemptRow,
  Ctx,
  Effects,
  MatchRow,
  PlayerRow,
  RecordRow,
  ResultReason,
  TournamentState,
} from "./types";

export const MAX_PLAYERS = 24;
export const COUNTDOWN_MS = 4000;

export class TError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const newEffects = (): Effects => ({ runs: [], logs: [], broadcasts: [] });

const LIVE: AttemptRow["status"][] = ["countdown", "playing", "paused", "judging"];

export function getMatch(s: TournamentState, id: string): MatchRow {
  const m = s.matches.find((m) => m.id === id);
  if (!m) throw new TError(404, "no_match", "경기를 찾을 수 없어요");
  return m;
}
export function getAttempt(s: TournamentState, id: string): AttemptRow {
  const a = s.attempts.find((a) => a.id === id);
  if (!a) throw new TError(404, "no_attempt", "시도를 찾을 수 없어요");
  return a;
}
export function playerByUser(s: TournamentState, userId: string): PlayerRow | undefined {
  return s.players.find((p) => p.userId === userId && !p.kicked);
}
export function survivors(s: TournamentState): PlayerRow[] {
  return s.players.filter((p) => !p.kicked && p.eliminatedRound === null);
}
export function recordOf(s: TournamentState, attemptId: string, playerId: string): RecordRow | undefined {
  return s.records.find((r) => r.attemptId === attemptId && r.playerId === playerId);
}
export function layoutOf(a: AttemptRow): LayoutJson | null {
  return a.layoutId ? (LAYOUTS_BY_ID[a.layoutId] ?? null) : null;
}

function log(s: TournamentState, fx: Effects, ctx: Ctx, actor: string, action: string, m: MatchRow | null, a: AttemptRow | null, reason?: string) {
  fx.logs.push({
    id: ctx.newId(),
    tournamentId: s.tournament.id,
    matchId: m?.id ?? null,
    attemptId: a?.id ?? null,
    actor,
    action,
    reason: reason ?? null,
    createdAt: ctx.now,
  });
}

const tTopic = (s: TournamentState) => `tournament:${s.tournament.id}`;
const mTopic = (m: MatchRow) => `match:${m.id}`;

// ───────────── 참가 ─────────────

export function join(s: TournamentState, ctx: Ctx, fx: Effects, userId: string, nickname: string): PlayerRow {
  const existing = s.players.find((p) => p.userId === userId);
  if (existing) {
    if (existing.kicked) throw new TError(403, "kicked", "이 대회에 다시 들어올 수 없어요");
    return existing;
  }
  if (s.tournament.status !== "lobby") throw new TError(409, "closed", "참가가 마감되었어요");
  const active = s.players.filter((p) => !p.kicked);
  if (active.length >= MAX_PLAYERS) throw new TError(409, "full", `최대 ${MAX_PLAYERS}명까지 참가할 수 있어요`);
  const names = new Set(s.players.map((p) => p.displayName));
  let display = nickname;
  for (let i = 2; names.has(display); i++) display = `${nickname}${i}`;
  const p: PlayerRow = {
    id: ctx.newId(),
    tournamentId: s.tournament.id,
    userId,
    nickname,
    displayName: display,
    hadBye: false,
    lastByeRound: null,
    eliminatedRound: null,
    kicked: false,
    joinedAt: ctx.now,
  };
  s.players.push(p);
  fx.broadcasts.push({ topic: tTopic(s), event: "players_changed", payload: {} });
  return p;
}

export function kick(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, playerId: string, reason?: string) {
  const p = s.players.find((p) => p.id === playerId);
  if (!p) throw new TError(404, "no_player", "참가자를 찾을 수 없어요");
  if (p.kicked) return;
  p.kicked = true;
  if (s.tournament.status === "running") {
    const m = s.matches.find(
      (m) => m.round === s.tournament.currentRound && !m.locked && (m.playerA === p.id || m.playerB === p.id),
    );
    if (m && m.playerB !== null && !m.confirmed) {
      const other = m.playerA === p.id ? m.playerB : m.playerA;
      finishMatch(s, ctx, fx, m, other, "forfeit", true);
    }
    if (p.eliminatedRound === null) p.eliminatedRound = s.tournament.currentRound;
  }
  log(s, fx, ctx, actor, "kick", null, null, reason ?? p.displayName);
  fx.broadcasts.push({ topic: tTopic(s), event: "players_changed", payload: {} });
  maybeFinish(s, ctx, fx);
}

// ───────────── 대진 ─────────────

function newAttempt(s: TournamentState, ctx: Ctx, m: MatchRow, kind: AttemptRow["kind"], grade: AttemptRow["grade"]): AttemptRow {
  const no = s.attempts.filter((a) => a.matchId === m.id).length + 1;
  const a: AttemptRow = {
    id: ctx.newId(),
    matchId: m.id,
    tournamentId: s.tournament.id,
    attemptNo: no,
    kind,
    grade,
    layoutId: null,
    variant: null,
    themeId: null,
    contentVersion: null,
    status: "ready",
    startAt: null,
    endsAt: null,
    pausedAt: null,
    pausedMs: 0,
    result: null,
    judgedAt: null,
    createdAt: ctx.now,
  };
  s.attempts.push(a);
  m.currentAttemptId = a.id;
  return a;
}

function buildRound(s: TournamentState, ctx: Ctx, round: number) {
  const alive = survivors(s);
  const grade = gradeForRound(s.tournament.preset, s.tournament.plannedRounds, alive.length);
  const { pairs, bye } = pairRound(alive, round, ctx.rng);
  let slot = 0;
  for (const [a, b] of pairs) {
    const m: MatchRow = {
      id: ctx.newId(),
      tournamentId: s.tournament.id,
      round,
      slot: slot++,
      playerA: a,
      playerB: b,
      currentAttemptId: null,
      autoRematches: 0,
      winnerId: null,
      resultReason: null,
      needsTeacher: false,
      confirmed: false,
      locked: false,
    };
    s.matches.push(m);
    newAttempt(s, ctx, m, "first", grade);
  }
  if (bye) {
    const p = s.players.find((p) => p.id === bye)!;
    p.hadBye = true;
    p.lastByeRound = round;
    s.matches.push({
      id: ctx.newId(),
      tournamentId: s.tournament.id,
      round,
      slot: slot++,
      playerA: bye,
      playerB: null,
      currentAttemptId: null,
      autoRematches: 0,
      winnerId: bye,
      resultReason: "bye",
      needsTeacher: false,
      confirmed: true,
      locked: false,
    });
  }
}

/** 참가 마감 · 1라운드 대진 만들기 */
export function closeAndPair(s: TournamentState, ctx: Ctx, fx: Effects, actor: string) {
  if (s.tournament.status !== "lobby") throw new TError(409, "not_lobby", "이미 시작된 대회예요");
  const alive = survivors(s);
  if (alive.length < 2) throw new TError(409, "too_few", "2명 이상이어야 대회를 열 수 있어요");
  s.tournament.status = "running";
  s.tournament.currentRound = 1;
  s.tournament.startPlayers = alive.length;
  s.tournament.plannedRounds = roundsFor(alive.length);
  buildRound(s, ctx, 1);
  log(s, fx, ctx, actor, "close_and_pair", null, null);
  fx.broadcasts.push({ topic: tTopic(s), event: "bracket_changed", payload: { round: 1 } });
}

function roundUntouched(s: TournamentState, round: number) {
  return s.matches
    .filter((m) => m.round === round && m.playerB !== null)
    .every((m) => s.attempts.filter((a) => a.matchId === m.id).every((a) => a.status === "ready"));
}

/** 다시 섞기: 이 라운드에 시작한 경기가 없을 때만 */
export function reshuffle(s: TournamentState, ctx: Ctx, fx: Effects, actor: string) {
  const round = s.tournament.currentRound;
  if (s.tournament.status !== "running" || !roundUntouched(s, round))
    throw new TError(409, "started", "이미 시작한 경기가 있어 다시 섞을 수 없어요");
  const ids = new Set(s.matches.filter((m) => m.round === round).map((m) => m.id));
  // 이번 라운드 부전승 기록을 되돌린다
  for (const m of s.matches.filter((m) => ids.has(m.id) && m.playerB === null)) {
    const p = s.players.find((p) => p.id === m.playerA)!;
    p.hadBye = s.matches.some((x) => !ids.has(x.id) && x.playerB === null && x.playerA === p.id);
    const prev = s.matches.filter((x) => !ids.has(x.id) && x.playerB === null && x.playerA === p.id).map((x) => x.round);
    p.lastByeRound = prev.length ? Math.max(...prev) : null;
  }
  s.matches = s.matches.filter((m) => !ids.has(m.id));
  s.attempts = s.attempts.filter((a) => !ids.has(a.matchId));
  buildRound(s, ctx, round);
  log(s, fx, ctx, actor, "reshuffle", null, null);
  fx.broadcasts.push({ topic: tTopic(s), event: "bracket_changed", payload: { round } });
}

/** 두 선수의 자리를 바꾼다 (둘 다 아직 시작 전인 경기에서) */
export function swapPlayers(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, p1: string, p2: string) {
  const round = s.tournament.currentRound;
  const ms = s.matches.filter((m) => m.round === round);
  const m1 = ms.find((m) => m.playerA === p1 || m.playerB === p1);
  const m2 = ms.find((m) => m.playerA === p2 || m.playerB === p2);
  if (!m1 || !m2 || m1 === m2) throw new TError(400, "bad_swap", "바꿀 수 없는 자리예요");
  const fresh = (m: MatchRow) =>
    m.playerB === null || s.attempts.filter((a) => a.matchId === m.id).every((a) => a.status === "ready");
  if (!fresh(m1) || !fresh(m2) || m1.locked || m2.locked) throw new TError(409, "started", "시작한 경기는 바꿀 수 없어요");
  const put = (m: MatchRow, from: string, to: string) => {
    if (m.playerA === from) m.playerA = to;
    else m.playerB = to;
  };
  put(m1, p1, p2);
  put(m2, p2, p1);
  // 부전승 자리가 바뀌면 부전승 기록도 옮긴다
  for (const [m, now, before] of [
    [m1, p2, p1],
    [m2, p1, p2],
  ] as const) {
    if (m.playerB === null) {
      m.winnerId = now;
      const pn = s.players.find((p) => p.id === now)!;
      const pb = s.players.find((p) => p.id === before)!;
      pn.hadBye = true;
      pn.lastByeRound = round;
      pb.hadBye = s.matches.some((x) => x.playerB === null && x.playerA === pb.id && x.round !== round);
      pb.lastByeRound = pb.hadBye ? Math.max(...s.matches.filter((x) => x.playerB === null && x.playerA === pb.id).map((x) => x.round)) : null;
    }
  }
  log(s, fx, ctx, actor, "swap", null, null, `${p1}<->${p2}`);
  fx.broadcasts.push({ topic: tTopic(s), event: "bracket_changed", payload: { round } });
}

/** 다음 라운드 대진 만들기: 이번 라운드 전부 확정되어야 함. 이전 라운드는 잠긴다. */
export function nextRound(s: TournamentState, ctx: Ctx, fx: Effects, actor: string) {
  const t = s.tournament;
  if (t.status !== "running") throw new TError(409, "not_running", "진행 중인 대회가 아니에요");
  const cur = s.matches.filter((m) => m.round === t.currentRound);
  if (cur.some((m) => !m.confirmed)) throw new TError(409, "unconfirmed", "모든 경기를 확정해야 해요");
  const alive = survivors(s);
  if (alive.length <= 1) {
    maybeFinish(s, ctx, fx);
    return;
  }
  for (const m of cur) m.locked = true;
  t.currentRound += 1;
  buildRound(s, ctx, t.currentRound);
  log(s, fx, ctx, actor, "next_round", null, null, String(t.currentRound));
  fx.broadcasts.push({ topic: tTopic(s), event: "bracket_changed", payload: { round: t.currentRound } });
}

function maybeFinish(s: TournamentState, ctx: Ctx, fx: Effects) {
  const t = s.tournament;
  if (t.status !== "running") return;
  const cur = s.matches.filter((m) => m.round === t.currentRound);
  const alive = survivors(s);
  if (alive.length === 1 && cur.every((m) => m.confirmed)) {
    t.status = "finished";
    t.finishedAt = ctx.now;
    t.championId = alive[0].id;
    for (const m of cur) m.locked = true;
    fx.broadcasts.push({ topic: tTopic(s), event: "finished", payload: { championId: alive[0].id } });
  }
}

// ───────────── 시도 ─────────────

function assertCurrent(s: TournamentState, attemptId: string): { m: MatchRow; a: AttemptRow } {
  const a = getAttempt(s, attemptId);
  const m = getMatch(s, a.matchId);
  if (m.currentAttemptId !== a.id) throw new TError(409, "stale_attempt", "지난 시도예요");
  if (m.locked) throw new TError(409, "locked", "이미 끝난 경기예요");
  return { m, a };
}

/** 교사: 시도 시작 (ready → countdown). 맵 배정, start_at = now + 4초 */
export function startAttempt(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, attemptId: string) {
  const { m, a } = assertCurrent(s, attemptId);
  if (a.status !== "ready") throw new TError(409, "not_ready", "이미 시작한 시도예요");
  if (m.winnerId && m.confirmed) throw new TError(409, "finished", "이미 끝난 경기예요");
  const busy = s.attempts
    .filter((x) => x.id !== a.id && x.matchId !== m.id && LIVE.includes(x.status) && x.layoutId)
    .map((x) => ({ layoutId: x.layoutId!, variant: x.variant! }));
  const used = s.attempts.filter((x) => x.layoutId).map((x) => ({ layoutId: x.layoutId!, variant: x.variant!, at: x.startAt ?? 0 }));
  const prev = s.attempts
    .filter((x) => x.matchId === m.id && x.id !== a.id && x.layoutId)
    .sort((p, q) => q.attemptNo - p.attemptNo)[0];
  const pick = assignMap({
    grade: a.grade,
    layouts: ALL_LAYOUTS,
    used,
    busy,
    prevLayoutId: prev?.layoutId ?? null,
    prevThemeId: prev?.themeId ?? null,
    rng: ctx.rng,
  });
  a.layoutId = pick.layoutId;
  a.variant = pick.variant;
  a.themeId = pick.themeId;
  a.contentVersion = pick.contentVersion;
  a.status = "countdown";
  a.startAt = ctx.now + COUNTDOWN_MS;
  a.endsAt = a.startAt + s.tournament.timeLimitSec * 1000;
  m.winnerId = null;
  m.resultReason = null;
  m.needsTeacher = false;
  const map = buildMap(LAYOUTS_BY_ID[pick.layoutId], pick.variant);
  const d0 = startDistance(map);
  for (const pid of [m.playerA, m.playerB!]) {
    s.records.push({
      id: ctx.newId(),
      attemptId: a.id,
      tournamentId: s.tournament.id,
      playerId: pid,
      solved: false,
      bestBlocks: null,
      bestElapsedMs: null,
      minDistance: d0,
      bestProgram: null,
      runs: 0,
      done: false,
      lastRunId: null,
      lastProgram: null,
      lastFinal: null,
      updatedAt: ctx.now,
    });
  }
  log(s, fx, ctx, actor, "start", m, a);
  fx.broadcasts.push({
    topic: mTopic(m),
    event: "countdown",
    payload: { attempt_id: a.id, layout_id: a.layoutId, variant: a.variant, theme_id: a.themeId, start_at: a.startAt, ends_at: a.endsAt },
  });
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
}

/** 시간에 따른 상태 정리: countdown → playing, 마감·양쪽 제출 완료 시 판정 */
export function tick(s: TournamentState, ctx: Ctx, fx: Effects) {
  for (const a of s.attempts) {
    if (a.status === "countdown" && a.startAt !== null && ctx.now >= a.startAt) a.status = "playing";
    if (a.status === "playing") {
      const m = s.matches.find((m) => m.id === a.matchId);
      if (!m || m.currentAttemptId !== a.id) continue;
      const recs = s.records.filter((r) => r.attemptId === a.id);
      const bothDone = recs.length === 2 && recs.every((r) => r.done);
      if (bothDone || ctx.now > a.endsAt!) judgeAttempt(s, ctx, fx, a);
    }
  }
}

/** 선수: 실행 제출 */
export function submitRun(
  s: TournamentState,
  ctx: Ctx,
  fx: Effects,
  userId: string,
  attemptId: string,
  runId: string,
  program: Program,
  existingRun: { solved: boolean; blocks: number } | null,
) {
  const { m, a } = assertCurrent(s, attemptId);
  const p = playerByUser(s, userId);
  if (!p || (m.playerA !== p.id && m.playerB !== p.id)) throw new TError(403, "not_player", "이 경기의 선수가 아니에요");
  if (existingRun) return { ...existingRun, duplicate: true };
  if (a.status === "countdown" && ctx.now >= a.startAt!) a.status = "playing";
  if (a.status === "paused") throw new TError(409, "paused", "잠시 멈춤 중이에요");
  if (a.status !== "playing") throw new TError(409, "not_playing", "지금은 실행할 수 없어요");
  if (ctx.now < a.startAt! || ctx.now > a.endsAt!) throw new TError(409, "out_of_time", "시간이 끝났어요");
  const rec = recordOf(s, a.id, p.id)!;
  if (rec.done) throw new TError(409, "done", "이미 제출을 완료했어요");
  const layout = layoutOf(a)!;
  const err = checkProgram(program, layout);
  if (err) throw new TError(400, err.code, err.message);
  const map = buildMap(layout, a.variant!);
  const r = runProgram(map, program, { noTrace: true });
  const blocks = countBlocks(program);
  const solved = r.outcome === "success";
  const dist = minDistance(map, r.visited, distanceField(map));
  const elapsed = ctx.now - a.startAt! - a.pausedMs;
  fx.runs.push({
    id: ctx.newId(),
    attemptId: a.id,
    tournamentId: s.tournament.id,
    playerId: p.id,
    runId,
    program,
    receivedAt: ctx.now,
    solved,
    blocks,
    minDistance: dist,
    outcome: r.outcome,
  });
  rec.runs += 1;
  rec.minDistance = Math.min(rec.minDistance, dist);
  rec.lastRunId = runId;
  rec.lastProgram = program;
  rec.lastFinal = r.final;
  rec.updatedAt = ctx.now;
  if (solved && (!rec.solved || blocks < rec.bestBlocks!)) {
    rec.solved = true;
    rec.bestBlocks = blocks;
    rec.bestElapsedMs = elapsed;
    rec.bestProgram = program;
  }
  fx.broadcasts.push({
    topic: mTopic(m),
    event: "run_result",
    payload: { attempt_id: a.id, player_id: p.id, run_id: runId, solved, blocks, outcome: r.outcome },
  });
  return { solved, blocks, outcome: r.outcome, elapsedMs: elapsed, duplicate: false };
}

/** 선수: 제출 완료 (성공 기록이 있을 때만, 멱등) */
export function markDone(s: TournamentState, ctx: Ctx, fx: Effects, userId: string, attemptId: string) {
  const { m, a } = assertCurrent(s, attemptId);
  const p = playerByUser(s, userId);
  if (!p || (m.playerA !== p.id && m.playerB !== p.id)) throw new TError(403, "not_player", "이 경기의 선수가 아니에요");
  const rec = recordOf(s, a.id, p.id);
  if (!rec) throw new TError(409, "not_started", "아직 시작하지 않았어요");
  if (rec.done) return;
  if (!rec.solved) throw new TError(409, "not_solved", "성공한 기록이 있어야 해요");
  if (a.status !== "playing" && a.status !== "paused") throw new TError(409, "not_playing", "지금은 제출할 수 없어요");
  rec.done = true;
  rec.updatedAt = ctx.now;
  fx.broadcasts.push({ topic: mTopic(m), event: "player_done", payload: { attempt_id: a.id, player_id: p.id } });
  tick(s, ctx, fx);
}

export function pause(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, attemptId: string) {
  const { m, a } = assertCurrent(s, attemptId);
  if (a.status === "countdown" && ctx.now >= a.startAt!) a.status = "playing";
  if (a.status !== "playing") throw new TError(409, "not_playing", "진행 중인 시도만 멈출 수 있어요");
  if (ctx.now > a.endsAt!) throw new TError(409, "out_of_time", "이미 시간이 끝났어요");
  a.status = "paused";
  a.pausedAt = ctx.now;
  log(s, fx, ctx, actor, "pause", m, a);
  fx.broadcasts.push({ topic: mTopic(m), event: "paused", payload: { attempt_id: a.id, paused_ms: a.pausedMs } });
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
}

export function resume(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, attemptId: string) {
  const { m, a } = assertCurrent(s, attemptId);
  if (a.status !== "paused") throw new TError(409, "not_paused", "멈춘 시도가 아니에요");
  const d = ctx.now - a.pausedAt!;
  a.pausedMs += d;
  a.endsAt! += d;
  a.pausedAt = null;
  a.status = "playing";
  log(s, fx, ctx, actor, "resume", m, a);
  fx.broadcasts.push({ topic: mTopic(m), event: "resumed", payload: { attempt_id: a.id, paused_ms: a.pausedMs, ends_at: a.endsAt } });
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
}

/** 판정 (멱등). 두 선수 모두 제출 완료이거나 ends_at이 지났을 때만. */
export function judgeAttempt(s: TournamentState, ctx: Ctx, fx: Effects, a: AttemptRow) {
  if (a.status === "done") return a.result;
  const m = getMatch(s, a.matchId);
  const recs = s.records.filter((r) => r.attemptId === a.id);
  const ra = recs.find((r) => r.playerId === m.playerA)!;
  const rb = recs.find((r) => r.playerId === m.playerB)!;
  const bothDone = ra.done && rb.done;
  if (a.status !== "playing" || (!bothDone && ctx.now <= a.endsAt!)) return null;
  a.status = "judging";
  const res = judge(ra, rb, m.autoRematches);
  a.result = res;
  a.status = "done";
  a.judgedAt = ctx.now;
  if (res.winnerId) {
    m.winnerId = res.winnerId;
    m.resultReason = res.reason;
    m.needsTeacher = false;
  } else if (res.rematch) {
    m.autoRematches += 1;
    newAttempt(s, ctx, m, "auto", easierGrade(a.grade));
  } else {
    m.needsTeacher = true;
  }
  fx.broadcasts.push({
    topic: mTopic(m),
    event: "attempt_ended",
    payload: { attempt_id: a.id, winner_id: res.winnerId, rematch_pending: res.rematch, needs_teacher: res.needsTeacher, reason: res.reason },
  });
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
  return res;
}

function finishMatch(s: TournamentState, ctx: Ctx, fx: Effects, m: MatchRow, winner: string, reason: ResultReason, confirm: boolean) {
  // 진행 중 시도는 끝낸다
  const a = m.currentAttemptId ? s.attempts.find((x) => x.id === m.currentAttemptId) : undefined;
  if (a && a.status !== "done") {
    a.status = "done";
    a.judgedAt = ctx.now;
    a.result = { winnerId: winner, reason, rematch: false, needsTeacher: false };
    fx.broadcasts.push({ topic: mTopic(m), event: "attempt_ended", payload: { attempt_id: a.id, winner_id: winner, reason } });
  }
  // 이전 판정을 바꾸는 경우 탈락 기록을 되돌린다
  for (const pid of [m.playerA, m.playerB]) {
    const p = s.players.find((p) => p.id === pid);
    if (p && p.eliminatedRound === m.round && !p.kicked) p.eliminatedRound = null;
  }
  m.winnerId = winner;
  m.resultReason = reason;
  m.needsTeacher = false;
  if (confirm) applyConfirm(s, m);
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
}

function applyConfirm(s: TournamentState, m: MatchRow) {
  m.confirmed = true;
  const loser = m.playerA === m.winnerId ? m.playerB : m.playerA;
  const lp = s.players.find((p) => p.id === loser);
  if (lp && lp.eliminatedRound === null) lp.eliminatedRound = m.round;
}

/** 교사: 판정 결과 확정 (필요하면 승자 변경은 setWinner) */
export function confirm(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, matchId: string) {
  const m = getMatch(s, matchId);
  if (m.locked) throw new TError(409, "locked", "다음 라운드가 만들어져 바꿀 수 없어요");
  if (!m.winnerId) throw new TError(409, "no_winner", "아직 승자가 없어요");
  applyConfirm(s, m);
  log(s, fx, ctx, actor, "confirm", m, null);
  fx.broadcasts.push({ topic: mTopic(m), event: "confirmed", payload: { winner_id: m.winnerId } });
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
  maybeFinish(s, ctx, fx);
}

/** 교사: 승자 지정·변경. 어느 상태에서든 경기를 끝낸다. */
export function setWinner(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, matchId: string, winnerId: string, reason?: string) {
  const m = getMatch(s, matchId);
  if (m.locked) throw new TError(409, "locked", "다음 라운드가 만들어져 바꿀 수 없어요");
  if (m.playerB === null) throw new TError(409, "bye", "부전승 경기예요");
  if (winnerId !== m.playerA && winnerId !== m.playerB) throw new TError(400, "bad_winner", "이 경기의 선수가 아니에요");
  const loser = winnerId === m.playerA ? m.playerB : m.playerA;
  const lp = s.players.find((p) => p.id === loser)!;
  if (lp.kicked && m.resultReason === "forfeit") throw new TError(409, "kicked", "내보낸 선수는 이길 수 없어요");
  finishMatch(s, ctx, fx, m, winnerId, "teacher", true);
  log(s, fx, ctx, actor, "set_winner", m, null, reason ?? winnerId);
  maybeFinish(s, ctx, fx);
}

export function forfeit(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, matchId: string, loserId: string, reason?: string) {
  const m = getMatch(s, matchId);
  if (m.locked) throw new TError(409, "locked", "다음 라운드가 만들어져 바꿀 수 없어요");
  if (m.playerB === null) throw new TError(409, "bye", "부전승 경기예요");
  if (loserId !== m.playerA && loserId !== m.playerB) throw new TError(400, "bad_player", "이 경기의 선수가 아니에요");
  const winner = loserId === m.playerA ? m.playerB : m.playerA;
  finishMatch(s, ctx, fx, m, winner, "forfeit", true);
  log(s, fx, ctx, actor, "forfeit", m, null, reason ?? loserId);
  maybeFinish(s, ctx, fx);
}

/** 교사: 재경기 시도를 만든다 (자동 횟수와 별개). 진행 중이면 그 시도를 끝낸다. */
export function extraRematch(s: TournamentState, ctx: Ctx, fx: Effects, actor: string, matchId: string, reason?: string) {
  const m = getMatch(s, matchId);
  if (m.locked) throw new TError(409, "locked", "다음 라운드가 만들어져 바꿀 수 없어요");
  if (m.playerB === null) throw new TError(409, "bye", "부전승 경기예요");
  const cur = m.currentAttemptId ? getAttempt(s, m.currentAttemptId) : null;
  if (cur && cur.status === "ready") throw new TError(409, "ready", "이미 시작을 기다리는 시도가 있어요");
  if (cur && cur.status !== "done") {
    cur.status = "done";
    cur.judgedAt = ctx.now;
    cur.result = { winnerId: null, reason: null, rematch: true, needsTeacher: false };
    fx.broadcasts.push({ topic: mTopic(m), event: "attempt_ended", payload: { attempt_id: cur.id, rematch_pending: true } });
  }
  for (const pid of [m.playerA, m.playerB]) {
    const p = s.players.find((p) => p.id === pid);
    if (p && p.eliminatedRound === m.round && !p.kicked) p.eliminatedRound = null;
  }
  m.winnerId = null;
  m.resultReason = null;
  m.confirmed = false;
  m.needsTeacher = false;
  const a = newAttempt(s, ctx, m, "extra", cur ? easierGrade(cur.grade) : "D1");
  log(s, fx, ctx, actor, "rematch", m, a, reason);
  fx.broadcasts.push({ topic: tTopic(s), event: "match_changed", payload: { match_id: m.id } });
}
