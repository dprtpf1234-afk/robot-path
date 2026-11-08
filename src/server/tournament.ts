import "server-only";
import crypto from "node:crypto";
import { newEffects, survivors, TError, tick } from "@/tournament/machine";
import type { Ctx, Effects, TournamentState } from "@/tournament/types";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { store } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (a: TournamentState, b: TournamentState) => JSON.stringify(a) === JSON.stringify(b);

export function makeCtx(): Ctx {
  return { now: Date.now(), rng: Math.random, newId: () => crypto.randomUUID() };
}

/**
 * 대회 상태를 읽어 fn으로 바꾸고, 버전 검사와 함께 한 트랜잭션으로 저장한다(충돌 시 다시 읽어 재시도).
 * 매번 먼저 tick으로 마감 지난 시도를 판정한다 (대회 관련 API가 불릴 때마다 미판정 시도를 정리).
 */
export async function mutate<T>(
  tid: string,
  fn: (s: TournamentState, ctx: Ctx, fx: Effects) => T | Promise<T>,
): Promise<{ result: T; state: TournamentState }> {
  for (let i = 0; i < 10; i++) {
    const before = await store.loadState(tid);
    if (!before) throw new HttpError(404, "no_tournament", "대회를 찾을 수 없어요");
    const s = structuredClone(before);
    const ctx = makeCtx();
    const fx = newEffects();
    tick(s, ctx, fx);
    const ticked = structuredClone(s);
    const tickFx = structuredClone(fx);
    let result: T;
    try {
      result = await fn(s, ctx, fx);
    } catch (e) {
      // 오류여도 tick으로 생긴 판정은 저장해 둔다
      if (e instanceof TError && !same(before, ticked) && (await store.commitState(before, ticked, tickFx))) await publish(tickFx.broadcasts);
      throw e;
    }
    if (same(before, s) && fx.runs.length === 0 && fx.logs.length === 0) return { result, state: s };
    if (await store.commitState(before, s, fx)) {
      s.tournament.version = before.tournament.version + 1;
      await publish(fx.broadcasts);
      return { result, state: s };
    }
    await sleep(20 + Math.random() * 60 * (i + 1));
  }
  throw new HttpError(503, "busy", "잠시 후 다시 해 주세요");
}

export async function readState(tid: string) {
  return (await mutate(tid, () => null)).state;
}

// ───────── 보기 (역할별로 내보낼 값만) ─────────

export function bracketView(s: TournamentState) {
  const name = (id: string | null) => (id ? (s.players.find((p) => p.id === id)?.displayName ?? "?") : null);
  return s.matches
    .slice()
    .sort((a, b) => a.round - b.round || a.slot - b.slot)
    .map((m) => {
      const a = m.currentAttemptId ? s.attempts.find((x) => x.id === m.currentAttemptId) : null;
      const status = m.confirmed ? "done" : a && a.status !== "ready" && a.status !== "done" ? "live" : "waiting";
      return {
        id: m.id,
        round: m.round,
        slot: m.slot,
        playerA: m.playerA,
        playerB: m.playerB,
        nameA: name(m.playerA),
        nameB: name(m.playerB),
        winnerId: m.winnerId,
        reason: m.resultReason,
        confirmed: m.confirmed,
        status,
      };
    });
}

export function tournamentHeader(s: TournamentState) {
  const t = s.tournament;
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    joinCode: t.joinCode,
    preset: t.preset,
    timeLimitSec: t.timeLimitSec,
    currentRound: t.currentRound,
    plannedRounds: t.plannedRounds,
    championId: t.championId,
    championName: t.championId ? (s.players.find((p) => p.id === t.championId)?.displayName ?? null) : null,
    survivors: survivors(s).length,
    playerCount: s.players.filter((p) => !p.kicked).length,
    screenMatchId: t.screenMatchId,
  };
}

/** 시도 공개 정보 (맵·시각·상태·판정) */
export function attemptView(s: TournamentState, attemptId: string | null) {
  const a = attemptId ? s.attempts.find((x) => x.id === attemptId) : null;
  if (!a) return null;
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    kind: a.kind,
    grade: a.grade,
    layoutId: a.layoutId,
    variant: a.variant,
    themeId: a.themeId,
    status: a.status,
    startAt: a.startAt,
    endsAt: a.endsAt,
    pausedAt: a.pausedAt,
    pausedMs: a.pausedMs,
    result: a.result,
  };
}

/** 교사·관객: 경기 전체 (두 선수 프로그램 포함) */
export function fullMatchView(s: TournamentState, matchId: string) {
  const m = s.matches.find((x) => x.id === matchId);
  if (!m) return null;
  const a = m.currentAttemptId ? s.attempts.find((x) => x.id === m.currentAttemptId) : null;
  const rec = (pid: string | null) => {
    if (!pid) return null;
    const p = s.players.find((x) => x.id === pid);
    const r = a ? s.records.find((x) => x.attemptId === a.id && x.playerId === pid) : null;
    return {
      playerId: pid,
      name: p?.displayName ?? "?",
      kicked: p?.kicked ?? false,
      solved: r?.solved ?? false,
      bestBlocks: r?.bestBlocks ?? null,
      bestElapsedMs: r?.bestElapsedMs ?? null,
      minDistance: r?.minDistance ?? null,
      runs: r?.runs ?? 0,
      done: r?.done ?? false,
      lastRunId: r?.lastRunId ?? null,
      lastProgram: r?.lastProgram ?? null,
      lastFinal: r?.lastFinal ?? null,
      bestProgram: r?.bestProgram ?? null,
    };
  };
  return {
    id: m.id,
    round: m.round,
    slot: m.slot,
    winnerId: m.winnerId,
    reason: m.resultReason,
    needsTeacher: m.needsTeacher,
    confirmed: m.confirmed,
    locked: m.locked,
    autoRematches: m.autoRematches,
    attempt: attemptView(s, m.currentAttemptId),
    attempts: s.attempts.filter((x) => x.matchId === m.id).length,
    a: rec(m.playerA),
    b: rec(m.playerB),
  };
}

/** 선수: 자기 기록은 전부, 상대는 성공 여부·실행 횟수·제출 완료만 */
export function playerMatchView(s: TournamentState, matchId: string, myPlayerId: string) {
  const full = fullMatchView(s, matchId);
  if (!full) return null;
  const strip = (r: NonNullable<typeof full.a>) => ({
    playerId: r.playerId,
    name: r.name,
    solved: r.solved,
    runs: r.runs,
    done: r.done,
  });
  const meIsA = full.a?.playerId === myPlayerId;
  const me = meIsA ? full.a : full.b;
  const opp = meIsA ? full.b : full.a;
  return { ...full, a: undefined, b: undefined, me, opponent: opp ? strip(opp) : null };
}
