import { describe, expect, it } from "vitest";
import { fromCompact } from "@/engine/program";
import { solutionFor } from "@/engine/map";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { gradeForRound, pairRound, roundsFor } from "./bracket";
import { judge } from "./judge";
import * as M from "./machine";
import type { Ctx, Preset, TournamentState } from "./types";

function rngFrom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeState(preset: Preset = "all"): TournamentState {
  return {
    tournament: {
      id: "t1", eventId: "e1", teacherId: "teacher", name: "테스트", joinCode: "123456", preset, timeLimitSec: 180,
      status: "lobby", currentRound: 0, plannedRounds: 0, startPlayers: 0, championId: null, screenMatchId: null, createdAt: 0, finishedAt: null, version: 0,
    },
    players: [], matches: [], attempts: [], records: [],
  };
}

function ctxFactory(seed = 1) {
  let id = 0;
  const rng = rngFrom(seed);
  const c: Ctx = { now: 1_000_000, rng, newId: () => `id${++id}` };
  return c;
}

describe("라운드 등급 계산", () => {
  it("24명 전체 프리셋 예시 (PRD 7절 표)", () => {
    const T = roundsFor(24);
    expect(T).toBe(5);
    expect([24, 12, 6, 3, 2].map((n) => gradeForRound("all", T, n))).toEqual(["D2", "D3", "D4", "D4", "D5"]);
  });
  it("2명 대회는 결승 = 최고 등급", () => {
    expect(gradeForRound("low", roundsFor(2), 2)).toBe("D3");
  });
  it("9명은 9 → 5 → 3 → 2 → 1", () => {
    expect(roundsFor(9)).toBe(4);
  });
});

describe("판정", () => {
  const r = (playerId: string, solved: boolean, bestBlocks: number | null, bestElapsedMs: number | null, minDistance = 5) => ({
    playerId, solved, bestBlocks, bestElapsedMs, minDistance,
  });
  it("한 사람만 성공", () => expect(judge(r("a", true, 9, 9), r("b", false, null, null), 0).winnerId).toBe("a"));
  it("블록 수", () => expect(judge(r("a", true, 9, 1), r("b", true, 8, 100), 0)).toMatchObject({ winnerId: "b", reason: "fewer_blocks" }));
  it("경과 시간", () => expect(judge(r("a", true, 8, 1), r("b", true, 8, 100), 0)).toMatchObject({ winnerId: "a", reason: "faster" }));
  it("완전 동점은 교사", () => expect(judge(r("a", true, 8, 1), r("b", true, 8, 1), 0).needsTeacher).toBe(true));
  it("둘 다 실패 → 재경기 2번까지", () => {
    expect(judge(r("a", false, null, null), r("b", false, null, null), 0).rematch).toBe(true);
    expect(judge(r("a", false, null, null), r("b", false, null, null), 1).rematch).toBe(true);
    expect(judge(r("a", false, null, null, 3), r("b", false, null, null, 2), 2)).toMatchObject({ winnerId: "b", reason: "distance" });
    expect(judge(r("a", false, null, null, 2), r("b", false, null, null, 2), 2).needsTeacher).toBe(true);
  });
});

describe("부전승", () => {
  it("연속 부전승 없음, 받은 적 없는 선수 우선", () => {
    const rng = rngFrom(3);
    const ps = [1, 2, 3].map((i) => ({ id: `p${i}`, hadBye: true, lastByeRound: i === 1 ? 2 : 1 }));
    for (let k = 0; k < 50; k++) expect(pairRound(ps, 3, rng).bye).not.toBe("p1");
    const ps2 = [{ id: "a", hadBye: true, lastByeRound: 1 }, { id: "b", hadBye: false, lastByeRound: null }, { id: "c", hadBye: true, lastByeRound: 1 }];
    for (let k = 0; k < 20; k++) expect(pairRound(ps2, 2, rng).bye).toBe("b");
  });
});

type Behavior = "random" | "allFail";

/** 대회 하나를 끝까지 시뮬레이션한다 */
function simulate(n: number, preset: Preset, behavior: Behavior, seed: number) {
  const s = makeState(preset);
  const ctx = ctxFactory(seed);
  const fx = M.newEffects();
  for (let i = 0; i < n; i++) M.join(s, ctx, fx, `u${i}`, `선수${i % 5}`);
  M.closeAndPair(s, ctx, fx, "teacher");
  const byeRounds = new Map<string, number[]>();
  let guard = 0;
  while (s.tournament.status === "running" && guard++ < 200) {
    const round = s.tournament.currentRound;
    const ms = s.matches.filter((m) => m.round === round);
    for (const m of ms.filter((m) => m.playerB === null)) byeRounds.set(m.playerA, [...(byeRounds.get(m.playerA) ?? []), round]);
    // 이 라운드 모두 시작 (동시 진행)
    for (let loop = 0; loop < 10 && ms.some((m) => !m.confirmed); loop++) {
      const ready = ms.filter((m) => !m.confirmed && m.currentAttemptId && M.getAttempt(s, m.currentAttemptId).status === "ready");
      for (const m of ready) M.startAttempt(s, ctx, fx, "teacher", m.currentAttemptId!);
      // 같은 라운드에서 동시에 진행 중인 경기는 같은 (레이아웃, 변형)을 쓰지 않는다
      const live = s.attempts.filter((a) => a.status === "countdown");
      const combos = live.map((a) => `${a.layoutId}|${a.variant}`);
      expect(new Set(combos).size).toBe(combos.length);
      ctx.now += 5000;
      M.tick(s, ctx, M.newEffects());
      for (const m of ready) {
        const a = M.getAttempt(s, m.currentAttemptId!);
        const layout = LAYOUTS_BY_ID[a.layoutId!];
        expect(layout.grade).toBe(a.grade);
        for (const [pi, pid] of [m.playerA, m.playerB!].entries()) {
          const user = s.players.find((p) => p.id === pid)!.userId;
          const good = behavior === "random" && ctx.rng() < 0.6;
          const prog = good ? solutionFor(layout, a.variant!) : fromCompact(["left"]);
          ctx.now += 10 + pi;
          M.submitRun(s, ctx, fx, user, a.id, `${a.id}-${pid}`, prog, null);
          if (good && ctx.rng() < 0.5) M.markDone(s, ctx, fx, user, a.id);
        }
      }
      ctx.now += s.tournament.timeLimitSec * 1000 + 1000;
      M.tick(s, ctx, fx);
      for (const m of ms) {
        if (m.confirmed) continue;
        if (m.needsTeacher) M.setWinner(s, ctx, fx, "teacher", m.id, m.playerA);
        else if (m.winnerId) M.confirm(s, ctx, fx, "teacher", m.id);
      }
    }
    expect(ms.every((m) => m.confirmed)).toBe(true);
    if (s.tournament.status === "running") M.nextRound(s, ctx, fx, "teacher");
  }
  return { s, byeRounds };
}

describe("대회 시뮬레이션", () => {
  for (let n = 2; n <= 24; n++) {
    it(`${n}명: 우승자 1명, 연속 부전승 없음`, () => {
      for (const preset of ["low", "all", "high"] as Preset[]) {
        const { s, byeRounds } = simulate(n, preset, "random", n * 31 + preset.length);
        expect(s.tournament.status).toBe("finished");
        const alive = M.survivors(s);
        expect(alive.length).toBe(1);
        expect(s.tournament.championId).toBe(alive[0].id);
        for (const rounds of byeRounds.values()) for (let i = 1; i < rounds.length; i++) expect(rounds[i] - rounds[i - 1]).toBeGreaterThan(1);
        const matches = s.matches.filter((m) => m.playerB !== null).length;
        expect(matches).toBe(n - 1);
      }
    });
  }
  it("저학년 24명 전원 재경기(둘 다 실패)에서도 맵 배정이 된다", () => {
    const { s } = simulate(24, "low", "allFail", 99);
    expect(s.tournament.status).toBe("finished");
    const first = s.matches.filter((m) => m.round === 1 && m.playerB !== null);
    for (const m of first) {
      const atts = s.attempts.filter((a) => a.matchId === m.id).sort((a, b) => a.attemptNo - b.attemptNo);
      expect(atts.length).toBe(3);
      expect(atts.map((a) => a.grade)).toEqual(["D1", "D1", "D1"]);
      // 같은 경기의 직전 시도와 다른 레이아웃
      expect(atts[1].layoutId).not.toBe(atts[0].layoutId);
      expect(atts[2].layoutId).not.toBe(atts[1].layoutId);
      expect(m.resultReason === "distance" || m.resultReason === "teacher").toBe(true);
    }
  });
});

describe("시도 규칙", () => {
  function setup() {
    const s = makeState("all");
    const ctx = ctxFactory(5);
    const fx = M.newEffects();
    M.join(s, ctx, fx, "ua", "민수");
    M.join(s, ctx, fx, "ub", "민수");
    M.closeAndPair(s, ctx, fx, "teacher");
    const m = s.matches[0];
    return { s, ctx, fx, m, aId: m.currentAttemptId! };
  }
  it("닉네임이 겹치면 번호를 붙인다", () => {
    const { s } = setup();
    expect(s.players.map((p) => p.displayName)).toEqual(["민수", "민수2"]);
  });
  it("start_at 이전·ends_at 이후 제출 거부, 실행 id 멱등", () => {
    const { s, ctx, fx, aId } = setup();
    M.startAttempt(s, ctx, fx, "teacher", aId);
    const a = M.getAttempt(s, aId);
    const layout = LAYOUTS_BY_ID[a.layoutId!];
    const sol = solutionFor(layout, a.variant!);
    expect(() => M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, null)).toThrow(/실행할 수 없어요/);
    ctx.now = a.startAt! + 1000;
    const r = M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, null);
    expect(r.solved).toBe(true);
    expect(M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, { solved: true, blocks: 1 }).duplicate).toBe(true);
    ctx.now = a.endsAt! + 1;
    expect(() => M.submitRun(s, ctx, fx, "ub", aId, "r2", sol, null)).toThrow();
  });
  it("일시정지 중 실행 거부, 재개 시 ends_at 연장, 경과 시간에서 멈춘 시간 제외", () => {
    const { s, ctx, fx, aId } = setup();
    M.startAttempt(s, ctx, fx, "teacher", aId);
    const a = M.getAttempt(s, aId);
    const sol = solutionFor(LAYOUTS_BY_ID[a.layoutId!], a.variant!);
    ctx.now = a.startAt! + 10_000;
    M.pause(s, ctx, fx, "teacher", aId);
    const ends = a.endsAt!;
    ctx.now += 30_000;
    expect(() => M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, null)).toThrow(/멈춤/);
    M.resume(s, ctx, fx, "teacher", aId);
    expect(a.endsAt).toBe(ends + 30_000);
    ctx.now += 5_000;
    const r = M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, null);
    expect(r.elapsedMs).toBe(15_000);
  });
  it("제출 완료는 성공 기록이 있을 때만, 둘 다 완료하면 바로 판정", () => {
    const { s, ctx, fx, aId, m } = setup();
    M.startAttempt(s, ctx, fx, "teacher", aId);
    const a = M.getAttempt(s, aId);
    const sol = solutionFor(LAYOUTS_BY_ID[a.layoutId!], a.variant!);
    ctx.now = a.startAt! + 1;
    expect(() => M.markDone(s, ctx, fx, "ua", aId)).toThrow();
    M.submitRun(s, ctx, fx, "ua", aId, "r1", sol, null);
    M.submitRun(s, ctx, fx, "ub", aId, "r2", [...sol, { t: "left" }], null);
    M.markDone(s, ctx, fx, "ua", aId);
    M.markDone(s, ctx, fx, "ub", aId);
    expect(a.status).toBe("done");
    expect(m.winnerId).toBe(s.players[0].id);
    expect(m.resultReason).toBe("fewer_blocks");
    // 지난 시도로 들어온 늦은 요청은 거부 (재경기 후)
    M.extraRematch(s, ctx, fx, "teacher", m.id);
    expect(() => M.markDone(s, ctx, fx, "ua", aId)).toThrow(/지난 시도/);
  });
  it("다음 라운드가 만들어지면 결과를 바꿀 수 없다", () => {
    const s = makeState("all");
    const ctx = ctxFactory(8);
    const fx = M.newEffects();
    for (let i = 0; i < 4; i++) M.join(s, ctx, fx, `u${i}`, `p${i}`);
    M.closeAndPair(s, ctx, fx, "teacher");
    for (const m of s.matches) M.setWinner(s, ctx, fx, "teacher", m.id, m.playerA);
    M.nextRound(s, ctx, fx, "teacher");
    const r1 = s.matches.find((m) => m.round === 1)!;
    expect(() => M.setWinner(s, ctx, fx, "teacher", r1.id, r1.playerB!)).toThrow(/바꿀 수 없어요/);
  });
  it("25번째 입장은 막는다", () => {
    const s = makeState("all");
    const ctx = ctxFactory(1);
    const fx = M.newEffects();
    for (let i = 0; i < 24; i++) M.join(s, ctx, fx, `u${i}`, `p${i}`);
    expect(() => M.join(s, ctx, fx, "u24", "x")).toThrow(/최대 24명/);
  });
  it("경기 중 내보내면 기권 처리", () => {
    const { s, ctx, fx, m } = setup();
    M.startAttempt(s, ctx, fx, "teacher", m.currentAttemptId!);
    M.kick(s, ctx, fx, "teacher", m.playerA);
    expect(m.winnerId).toBe(m.playerB);
    expect(m.resultReason).toBe("forfeit");
    expect(s.tournament.status).toBe("finished");
  });
});
