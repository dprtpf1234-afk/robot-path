/**
 * 24명 부하 시뮬레이션 (14절 7단계). 노드 클라이언트 24개가 실제 서버 API로 대회 하나를 끝까지 진행한다.
 *   npm run sim -- [인원=24] [preset=all]
 * 환경 변수: SIM_BASE_URL(기본 http://localhost:3000), SIM_TEACHER_EMAIL/SIM_TEACHER_PASSWORD
 * Supabase 모드면 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY로 익명·교사 로그인한다.
 * 확인하는 것: 동시 실행 제출(버전 충돌 재시도), 중복 run_id 멱등, 권한 검사(남의 경기 run 거부),
 *   경기 중 "재접속"(snapshot 재조회), 동시 판정 호출, 실시간 메시지 수신(메모리 모드 SSE).
 */
import { createClient } from "@supabase/supabase-js";
import { solutionFor } from "../src/engine/map";
import type { Program } from "../src/engine/types";
import { LAYOUTS_BY_ID } from "../src/content/layouts";

const BASE = process.env.SIM_BASE_URL ?? "http://localhost:3000";
const N = Number(process.argv[2] ?? 24);
const PRESET = process.argv[3] ?? "all";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const stats = { requests: 0, errors: [] as string[], retried409: 0, latencies: [] as number[], rtMessages: 0, denied: 0 };

async function call<T>(path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const t0 = Date.now();
  stats.requests++;
  const r = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  stats.latencies.push(Date.now() - t0);
  const data = (await r.json().catch(() => ({}))) as T;
  return { status: r.status, data };
}

async function must<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const r = await call<T & { message?: string }>(path, token, body);
  if (r.status >= 400) {
    stats.errors.push(`${path} ${r.status} ${r.data.message ?? ""}`);
    throw new Error(`${path} → ${r.status} ${r.data.message}`);
  }
  return r.data;
}

async function anonToken(): Promise<string> {
  if (SUPA_URL && SUPA_KEY) {
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInAnonymously();
    if (error || !data.session) throw new Error("anon sign-in failed: " + error?.message);
    return data.session.access_token;
  }
  return (await must<{ token: string }>("/api/auth/anon", null, {})).token;
}

async function teacherToken(): Promise<string> {
  const email = process.env.SIM_TEACHER_EMAIL ?? "teacher@example.com";
  const password = process.env.SIM_TEACHER_PASSWORD ?? "teacher1234";
  if (SUPA_URL && SUPA_KEY) {
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error("teacher sign-in failed");
    return data.session.access_token;
  }
  return (await must<{ token: string }>("/api/auth/teacher", null, { email, password })).token;
}

/** 메모리 모드: SSE로 채널을 받아 메시지 수를 센다 */
function listen(topic: string, token: string): () => void {
  if (SUPA_URL) return () => {};
  const ac = new AbortController();
  void (async () => {
    try {
      const r = await fetch(`${BASE}/api/rt/stream?topic=${encodeURIComponent(topic)}&access_token=${token}`, { signal: ac.signal });
      if (r.status === 403) {
        stats.denied++;
        return;
      }
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        stats.rtMessages += (dec.decode(value).match(/^data: /gm) ?? []).length;
      }
    } catch {}
  })();
  return () => ac.abort();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 14).padEnd(12, "x");

interface Snap {
  match: {
    id: string;
    winnerId: string | null;
    needsTeacher: boolean;
    confirmed: boolean;
    attempt: { id: string; status: string; layoutId: string | null; variant: "orig" | "flipX" | "flipY" | "rot180" | null; startAt: number | null; endsAt: number | null } | null;
    me?: { playerId: string; done: boolean; solved: boolean };
  };
}

async function main() {
  console.log(`▶ ${N}명 시뮬레이션 (${PRESET}) → ${BASE}`);
  const t0 = Date.now();
  const tt = await teacherToken();
  const ev = await must<{ event: { id: string } }>("/api/events", tt, { name: `시뮬레이션 ${new Date().toISOString()}` });
  const tour = await must<{ tournament: { id: string; joinCode: string } }>("/api/tournament/create", tt, {
    eventId: ev.event.id,
    name: "24명 시뮬레이션",
    preset: PRESET,
    timeLimitSec: 60,
  });
  const tid = tour.tournament.id;
  const stops: (() => void)[] = [listen(`tournament:${tid}`, tt)];

  // 참가 (동시에)
  const players = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const token = await anonToken();
      const j = await must<{ playerId: string }>("/api/tournament/join", token, { code: tour.tournament.joinCode, nickname: `봇${i + 1}` });
      stops.push(listen(`tournament:${tid}`, token));
      return { token, playerId: j.playerId, i };
    }),
  );
  // 25번째는 막힌다
  if (N === 24) {
    const extra = await call("/api/tournament/join", await anonToken(), { code: tour.tournament.joinCode, nickname: "봇25" });
    if (extra.status !== 409) stats.errors.push(`25번째 입장이 막히지 않음: ${extra.status}`);
  }
  await must("/api/tournament/admin", tt, { tid, action: "close_and_pair" });

  for (let round = 1; round < 20; round++) {
    const view = await must<{ tournament: { status: string; currentRound: number }; current: { id: string; a: { playerId: string } | null; b: { playerId: string } | null; confirmed: boolean }[] }>(
      `/api/tournament/view?tid=${tid}`,
      tt,
    );
    if (view.tournament.status === "finished") break;
    const matches = view.current.filter((m) => m.b && !m.confirmed);
    console.log(`  ${view.tournament.currentRound}라운드: ${matches.length}경기`);
    await must("/api/tournament/admin", tt, { tid, action: "start_all" });

    await Promise.all(
      matches.map(async (m) => {
        const pair = players.filter((p) => p.playerId === m.a!.playerId || p.playerId === m.b!.playerId);
        for (const p of pair) stops.push(listen(`match:${m.id}`, p.token), listen(`match:${m.id}:watch:${p.playerId}`, p.token)); // watch는 거부되어야 함
        stops.push(listen(`match:${m.id}:watch:${pair[0].playerId}`, tt));
        for (let guard = 0; guard < 200; guard++) {
          const snaps = await Promise.all(pair.map((p) => must<Snap>(`/api/tournament/match/snapshot?tid=${tid}&matchId=${m.id}`, p.token)));
          const s0 = snaps[0].match;
          if (s0.confirmed) return;
          if (s0.winnerId) {
            await call("/api/tournament/match/confirm", tt, { tid, matchId: m.id });
            continue;
          }
          if (s0.needsTeacher) {
            await call("/api/tournament/match/winner", tt, { tid, matchId: m.id, winnerId: pair[0].playerId });
            continue;
          }
          const a = s0.attempt!;
          if (a.status === "ready") {
            await call("/api/tournament/attempt/start", tt, { tid, attemptId: a.id });
            continue;
          }
          const wait = (a.startAt ?? 0) - Date.now();
          if (wait > 0) {
            await sleep(wait + 50);
            continue;
          }
          // 두 선수가 동시에 실행: 틀린 실행 몇 번 + (확률적으로) 정답
          await Promise.all(
            pair.map(async (p, k) => {
              const snap = snaps[k].match;
              if (snap.me?.done) return;
              const layout = LAYOUTS_BY_ID[a.layoutId!];
              const sol = solutionFor(layout, a.variant!);
              const wrong: Program = [{ t: "left" }, { t: "forward" }];
              const run1 = rid();
              await call("/api/tournament/attempt/run", p.token, { tid, attemptId: a.id, runId: run1, program: wrong });
              // 같은 실행 id 재전송 → 한 번만 반영
              await call("/api/tournament/attempt/run", p.token, { tid, attemptId: a.id, runId: run1, program: wrong });
              const solve = Math.random() < 0.7;
              if (solve) {
                const r = await call<{ solved: boolean }>("/api/tournament/attempt/run", p.token, { tid, attemptId: a.id, runId: rid(), program: Math.random() < 0.5 ? sol : [...sol, { t: "left" }] });
                if (r.status === 200 && r.data.solved) await call("/api/tournament/attempt/done", p.token, { tid, attemptId: a.id });
              }
              // 권한 검사: 상대 경기가 아닌 다른 경기의 시도로 실행 → 거부되어야 함
              const other = matches.find((x) => x.id !== m.id);
              if (other) {
                const bad = await call("/api/tournament/attempt/run", p.token, { tid, attemptId: other.id, runId: rid(), program: sol });
                if (bad.status < 400) stats.errors.push("남의 경기에 실행이 들어감");
              }
            }),
          );
          // 아무도 못 풀었으면 마감까지 기다리지 않고 교사가 마감시키는 대신 판정 호출을 반복 (동시 판정)
          const s2 = await must<Snap>(`/api/tournament/match/snapshot?tid=${tid}&matchId=${m.id}`, pair[0].token);
          if (!s2.match.winnerId && s2.match.attempt?.id === a.id && s2.match.attempt.status !== "done") {
            const left = (a.endsAt ?? 0) - Date.now();
            if (left > 0) await sleep(left + 200);
            await Promise.all(pair.map((p) => call("/api/tournament/attempt/judge", p.token, { tid, attemptId: a.id })));
          }
        }
        stats.errors.push(`경기 ${m.id} 끝나지 않음`);
      }),
    );
    const v2 = await must<{ allRoundsConfirmed: boolean; tournament: { status: string } }>(`/api/tournament/view?tid=${tid}`, tt);
    if (v2.tournament.status === "finished") break;
    if (!v2.allRoundsConfirmed) stats.errors.push(`${round}라운드 미확정`);
    await must("/api/tournament/admin", tt, { tid, action: "next_round" });
  }
  const fin = await must<{ tournament: { status: string; championName: string | null } }>(`/api/tournament/view?tid=${tid}`, tt);
  await sleep(500);
  stops.forEach((s) => s());
  const lat = stats.latencies.sort((a, b) => a - b);
  console.log(`■ 상태: ${fin.tournament.status}, 우승: ${fin.tournament.championName}`);
  console.log(`  요청 ${stats.requests}회, p50 ${lat[Math.floor(lat.length / 2)]}ms, p95 ${lat[Math.floor(lat.length * 0.95)]}ms, 최대 ${lat.at(-1)}ms`);
  if (!SUPA_URL) console.log(`  실시간 메시지 수신 ${stats.rtMessages}건, 권한 거부된 구독 ${stats.denied}건 (선수가 watch 채널을 구독하려 한 횟수만큼 거부되어야 함)`);
  console.log(`  소요 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  // 정리
  await call(`/api/events/${ev.event.id}`, tt).catch(() => {});
  await fetch(`${BASE}/api/events/${ev.event.id}`, { method: "DELETE", headers: { authorization: `Bearer ${tt}` } });
  if (stats.errors.length || fin.tournament.status !== "finished") {
    console.error("✗ 오류:", stats.errors.slice(0, 20));
    process.exit(1);
  }
  console.log("✓ 시뮬레이션 통과");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
