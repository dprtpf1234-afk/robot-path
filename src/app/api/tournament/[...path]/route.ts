/**
 * 대회 API. 모든 요청은 호출자 권한(교사·선수·관객), 현재 시도 id, 시도 상태를 확인한다.
 * 상태를 바꾸는 동작은 mutate()가 버전 검사와 함께 한 트랜잭션으로 저장한다.
 */
import crypto from "node:crypto";
import { parseProgram } from "@/engine/program";
import type { Program } from "@/engine/types";
import * as M from "@/tournament/machine";
import { PRESETS } from "@/tournament/bracket";
import type { Preset, TournamentRow, TournamentState } from "@/tournament/types";
import { checkNickname } from "@/lib/profanity";
import { Caller, getCaller, hashSecret, requireCaller, requireTeacher } from "@/server/auth";
import { ENTRY_KEY_PEPPER } from "@/server/config";
import { fail, handle, HttpError, ok, readJsonBody } from "@/server/http";
import { publish } from "@/server/realtime";
import { store } from "@/server/store";
import { attemptView, bracketView, fullMatchView, mutate, playerMatchView, readState, tournamentHeader } from "@/server/tournament";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const noStore = { headers: { "cache-control": "no-store" } };
const s = (v: unknown) => (typeof v === "string" && v.length <= 100 ? v : "");

async function roleOf(st: TournamentState, c: Caller | null) {
  if (!c) return { teacher: false, player: null as string | null, viewer: false };
  const teacher = st.tournament.teacherId === c.userId && !c.anon && (await store.isTeacher(c.userId));
  const p = st.players.find((x) => x.userId === c.userId && !x.kicked);
  const viewer = !teacher && !p ? await store.isViewer(st.tournament.id, c.userId, Date.now()) : false;
  return { teacher, player: p?.id ?? null, viewer };
}

async function teacherOf(req: Request, tid: string) {
  const c = await requireTeacher(req);
  const st = await store.loadState(tid);
  if (!st || st.tournament.teacherId !== c.userId) throw new HttpError(404, "no_tournament", "대회를 찾을 수 없어요");
  return c;
}

function teacherView(st: TournamentState) {
  const round = st.tournament.currentRound;
  return {
    tournament: tournamentHeader(st),
    players: st.players.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.displayName,
      kicked: p.kicked,
      eliminatedRound: p.eliminatedRound,
      hadBye: p.hadBye,
    })),
    bracket: bracketView(st),
    current: st.matches.filter((m) => m.round === round).map((m) => fullMatchView(st, m.id)),
    allRoundsConfirmed: st.matches.filter((m) => m.round === round).every((m) => m.confirmed),
    roundUntouched: st.matches
      .filter((m) => m.round === round && m.playerB !== null)
      .every((m) => st.attempts.filter((a) => a.matchId === m.id).every((a) => a.status === "ready")),
  };
}

const GET_ROUTES: Record<string, (req: Request, q: URLSearchParams) => Promise<Response>> = {
  // 교사: 행사의 대회 목록
  async list(req, q) {
    const c = await requireTeacher(req);
    const e = await store.getEvent(q.get("eventId") ?? "");
    if (!e || e.teacherId !== c.userId) return fail(404, "no_event", "행사를 찾을 수 없어요");
    return ok({ tournaments: await store.listTournaments(e.id) }, noStore);
  },
  // 교사: 운영형 대진표 전체
  async view(req, q) {
    const tid = q.get("tid") ?? "";
    await teacherOf(req, tid);
    const st = await readState(tid);
    const tokens = (await store.listSpectatorTokens(tid)).filter((t) => !t.revokedAt && t.expiresAt > Date.now());
    return ok({ ...teacherView(st), screenActive: tokens.length > 0, serverNow: Date.now() }, noStore);
  },
  // 선수: 대기실·내 경기
  async lobby(req, q) {
    const c = await requireCaller(req);
    const st = await readState(q.get("tid") ?? "");
    const me = st.players.find((p) => p.userId === c.userId);
    if (!me) return fail(403, "not_player", "이 대회 참가자가 아니에요");
    const round = st.tournament.currentRound;
    const myMatch = st.matches.find((m) => m.round === round && (m.playerA === me.id || m.playerB === me.id));
    return ok(
      {
        tournament: tournamentHeader(st),
        me: { id: me.id, name: me.displayName, kicked: me.kicked, eliminatedRound: me.eliminatedRound },
        players: st.players.filter((p) => !p.kicked).map((p) => ({ id: p.id, name: p.displayName })),
        bracket: bracketView(st),
        myMatch: myMatch ? playerMatchView(st, myMatch.id, me.id) : null,
        serverNow: Date.now(),
      },
      noStore,
    );
  },
  // 선수·교사·관객: 시도 상태 스냅샷 (중간 입장·재접속)
  async "match/snapshot"(req, q) {
    const c = await getCaller(req);
    const st = await readState(q.get("tid") ?? "");
    const r = await roleOf(st, c);
    const matchId = q.get("matchId") ?? "";
    if (r.teacher || r.viewer) return ok({ match: fullMatchView(st, matchId), tournament: tournamentHeader(st), serverNow: Date.now() }, noStore);
    if (r.player) {
      const m = st.matches.find((x) => x.id === matchId);
      if (!m || (m.playerA !== r.player && m.playerB !== r.player)) return fail(403, "forbidden", "볼 수 없는 경기예요");
      return ok({ match: playerMatchView(st, matchId, r.player), tournament: tournamentHeader(st), serverNow: Date.now() }, noStore);
    }
    return fail(403, "forbidden", "볼 수 없는 경기예요");
  },
  // 관객 화면: 대진표 + 교사가 고른 경기
  async "screen/state"(req, q) {
    const c = await requireCaller(req);
    const tid = q.get("tid") ?? "";
    if (!(await store.isViewer(tid, c.userId, Date.now()))) return fail(403, "revoked", "관객 화면이 닫혔어요");
    const st = await readState(tid);
    const focus = st.tournament.screenMatchId;
    const live = st.matches.find(
      (m) => m.round === st.tournament.currentRound && m.currentAttemptId && ["countdown", "playing", "paused"].includes(st.attempts.find((a) => a.id === m.currentAttemptId)?.status ?? ""),
    );
    const matchId = focus ?? live?.id ?? null;
    return ok(
      { tournament: tournamentHeader(st), bracket: bracketView(st), match: matchId ? fullMatchView(st, matchId) : null, serverNow: Date.now() },
      noStore,
    );
  },
};

const POST_ROUTES: Record<string, (req: Request, b: Body) => Promise<Response>> = {
  // 교사: 대회 만들기
  async create(req, b) {
    const c = await requireTeacher(req);
    const e = await store.getEvent(s(b.eventId));
    if (!e || e.teacherId !== c.userId) return fail(404, "no_event", "행사를 찾을 수 없어요");
    const name = s(b.name).trim().slice(0, 40) || "로봇 길찾기 대회";
    const preset = (["low", "all", "high"].includes(s(b.preset)) ? s(b.preset) : "all") as Preset;
    const limit = Math.round(Number(b.timeLimitSec ?? 180));
    if (!(limit >= 60 && limit <= 300)) return fail(400, "bad_limit", "제한시간은 60~300초예요");
    let joinCode = "";
    for (let i = 0; i < 30 && !joinCode; i++) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      if (!(await store.getTournamentByCode(code))) joinCode = code;
    }
    if (!joinCode) return fail(503, "busy", "잠시 후 다시 해 주세요");
    const t: TournamentRow = {
      id: crypto.randomUUID(),
      eventId: e.id,
      teacherId: c.userId,
      name,
      joinCode,
      preset,
      timeLimitSec: limit,
      status: "lobby",
      currentRound: 0,
      plannedRounds: 0,
      startPlayers: 0,
      championId: null,
      screenMatchId: null,
      createdAt: Date.now(),
      finishedAt: null,
      version: 0,
    };
    await store.createTournament(t);
    return ok({ tournament: t, presetInfo: PRESETS[preset] });
  },
  // 학생: 참가 (코드 + 닉네임). 인원 확인과 등록은 한 번의 저장으로.
  async join(req, b) {
    const c = await requireCaller(req);
    if (!(await store.hit(`join:${c.userId}`, 60, 10))) return fail(429, "slow_down", "1분 뒤에 다시 해 주세요");
    const code = s(b.code).trim();
    if (!/^\d{6}$/.test(code)) return fail(400, "bad_code", "참가 코드는 숫자 6자리예요");
    const nickname = s(b.nickname).trim().normalize("NFC");
    const err = checkNickname(nickname);
    if (err) return fail(400, "bad_nickname", err);
    const t = await store.getTournamentByCode(code);
    if (!t) return fail(404, "no_tournament", "참가 코드를 다시 확인해 주세요");
    const { result } = await mutate(t.id, (st, ctx, fx) => M.join(st, ctx, fx, c.userId, nickname));
    return ok({ tid: t.id, playerId: result.id, name: result.displayName });
  },
  // 교사: 대회 운영 조작
  async admin(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    const actor = `teacher:${c.userId}`;
    const action = s(b.action);
    const { state } = await mutate(tid, (st, ctx, fx) => {
      switch (action) {
        case "close_and_pair":
          return M.closeAndPair(st, ctx, fx, actor);
        case "reshuffle":
          return M.reshuffle(st, ctx, fx, actor);
        case "swap":
          return M.swapPlayers(st, ctx, fx, actor, s(b.p1), s(b.p2));
        case "next_round":
          return M.nextRound(st, ctx, fx, actor);
        case "kick":
          return M.kick(st, ctx, fx, actor, s(b.playerId), s(b.reason) || undefined);
        case "start_all": {
          const round = st.tournament.currentRound;
          for (const m of st.matches.filter((m) => m.round === round && m.playerB && !m.confirmed && m.currentAttemptId)) {
            const a = M.getAttempt(st, m.currentAttemptId!);
            if (a.status === "ready") M.startAttempt(st, ctx, fx, actor, a.id);
          }
          return;
        }
        case "screen_focus":
          st.tournament.screenMatchId = s(b.matchId) || null;
          fx.broadcasts.push({ topic: `tournament:${st.tournament.id}`, event: "screen_focus", payload: { match_id: st.tournament.screenMatchId } });
          return;
        default:
          throw new HttpError(400, "bad_action", "알 수 없는 조작이에요");
      }
    });
    return ok(teacherView(state));
  },
  async "attempt/start"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    const { state } = await mutate(tid, (st, ctx, fx) => M.startAttempt(st, ctx, fx, `teacher:${c.userId}`, s(b.attemptId)));
    return ok({ attempt: attemptView(state, s(b.attemptId)) });
  },
  async "attempt/pause"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.pause(st, ctx, fx, `teacher:${c.userId}`, s(b.attemptId)));
    return ok({ ok: true });
  },
  async "attempt/resume"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.resume(st, ctx, fx, `teacher:${c.userId}`, s(b.attemptId)));
    return ok({ ok: true });
  },
  // 선수: 실행을 누른 즉시 제출
  async "attempt/run"(req, b) {
    const c = await requireCaller(req);
    const tid = s(b.tid);
    const attemptId = s(b.attemptId);
    const runId = s(b.runId);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(runId)) return fail(400, "bad_run", "잘못된 요청이에요");
    const program = parseProgram(b.program);
    if (!program) return fail(400, "bad_program", "잘못된 프로그램이에요");
    const { result } = await mutate(tid, async (st, ctx, fx) => {
      const prev = await store.findRun(attemptId, runId);
      return M.submitRun(st, ctx, fx, c.userId, attemptId, runId, program as Program, prev ? { solved: prev.solved, blocks: prev.blocks } : null);
    });
    return ok(result);
  },
  async "attempt/done"(req, b) {
    const c = await requireCaller(req);
    await mutate(s(b.tid), (st, ctx, fx) => M.markDone(st, ctx, fx, c.userId, s(b.attemptId)));
    return ok({ ok: true });
  },
  // 그 대회의 누구나: 마감이 지났거나 양쪽 제출 완료면 판정 (멱등)
  async "attempt/judge"(req, b) {
    const c = await requireCaller(req);
    const tid = s(b.tid);
    const st0 = await store.loadState(tid);
    if (!st0) return fail(404, "no_tournament", "대회를 찾을 수 없어요");
    const r = await roleOf(st0, c);
    if (!r.teacher && !r.player && !r.viewer) return fail(403, "forbidden", "이 대회 사람이 아니에요");
    const { state } = await mutate(tid, () => null); // tick이 판정한다
    return ok({ attempt: attemptView(state, s(b.attemptId)) });
  },
  async "match/confirm"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.confirm(st, ctx, fx, `teacher:${c.userId}`, s(b.matchId)));
    return ok({ ok: true });
  },
  async "match/winner"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.setWinner(st, ctx, fx, `teacher:${c.userId}`, s(b.matchId), s(b.winnerId), s(b.reason) || undefined));
    return ok({ ok: true });
  },
  async "match/forfeit"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.forfeit(st, ctx, fx, `teacher:${c.userId}`, s(b.matchId), s(b.loserId), s(b.reason) || undefined));
    return ok({ ok: true });
  },
  async "match/rematch"(req, b) {
    const tid = s(b.tid);
    const c = await teacherOf(req, tid);
    await mutate(tid, (st, ctx, fx) => M.extraRematch(st, ctx, fx, `teacher:${c.userId}`, s(b.matchId), s(b.reason) || undefined));
    return ok({ ok: true });
  },
  // 교사: 관객 화면 링크 만들기 (만료 = min(생성+48시간, 대회 종료+24시간))
  async "screen/open"(req, b) {
    const tid = s(b.tid);
    await teacherOf(req, tid);
    const st = await store.loadState(tid);
    const token = crypto.randomBytes(24).toString("base64url");
    const now = Date.now();
    let expiresAt = now + 48 * 3600_000;
    if (st?.tournament.finishedAt) expiresAt = Math.min(expiresAt, st.tournament.finishedAt + 24 * 3600_000);
    await store.createSpectatorToken({ id: crypto.randomUUID(), tokenHash: hashSecret(token, ENTRY_KEY_PEPPER), tournamentId: tid, createdAt: now, expiresAt, revokedAt: null });
    return ok({ token, expiresAt });
  },
  // 교사: 관객 화면 회수 → 종료 이벤트, 이후 재구독은 거부
  async "screen/revoke"(req, b) {
    const tid = s(b.tid);
    await teacherOf(req, tid);
    await store.revokeSpectatorTokens(tid, Date.now());
    await publish([{ topic: `tournament:${tid}`, event: "screen_closed", payload: {} }]);
    return ok({ ok: true });
  },
  // 관객 화면: 익명 로그인 후 토큰 확인 → tournament_viewers 등록
  async "screen/verify"(req, b) {
    const c = await requireCaller(req);
    const token = s(b.token);
    const t = await store.findSpectatorToken(hashSecret(token, ENTRY_KEY_PEPPER));
    const now = Date.now();
    if (!t || t.revokedAt || t.expiresAt <= now) return fail(403, "revoked", "관객 화면 링크가 만료되었어요");
    const st = await store.loadState(t.tournamentId);
    let expiresAt = t.expiresAt;
    if (st?.tournament.finishedAt) expiresAt = Math.min(expiresAt, st.tournament.finishedAt + 24 * 3600_000);
    if (expiresAt <= now) return fail(403, "revoked", "관객 화면 링크가 만료되었어요");
    await store.addViewer({ tournamentId: t.tournamentId, userId: c.userId, tokenId: t.id, expiresAt });
    return ok({ tid: t.tournamentId, expiresAt });
  },
};

export const GET = handle(async (req, { params }) => {
  const { path } = (await params) as { path: string[] };
  const fn = GET_ROUTES[path.join("/")];
  if (!fn) return fail(404, "not_found", "없는 주소예요");
  return fn(req, new URL(req.url).searchParams);
});

export const POST = handle(async (req, { params }) => {
  const { path } = (await params) as { path: string[] };
  const fn = POST_ROUTES[path.join("/")];
  if (!fn) return fail(404, "not_found", "없는 주소예요");
  return fn(req, await readJsonBody<Body>(req));
});
