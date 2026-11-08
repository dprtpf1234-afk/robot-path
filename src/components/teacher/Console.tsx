"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { PRESETS } from "@/tournament/bracket";
import type { Preset } from "@/tournament/types";
import { api, ApiError, teacherToken } from "@/lib/api";
import { syncClock, useServerNow } from "@/lib/clock";
import { subscribe } from "@/lib/rt";
import { QR } from "../ui/QR";
import { Bracket, BracketMatch, roundName } from "../tournament/Bracket";
import { fmtTime, MatchV, REASON_TEXT, remainingMs, THeader } from "../tournament/types";

interface View {
  tournament: THeader;
  players: { id: string; userId: string; name: string; kicked: boolean; eliminatedRound: number | null; hadBye: boolean }[];
  bracket: BracketMatch[];
  current: MatchV[];
  allRoundsConfirmed: boolean;
  roundUntouched: boolean;
  screenActive: boolean;
}

/** 교사 주 화면: 운영형 대진표 (관전이 아니라 운영) */
export function Console({ tid }: { tid: string }) {
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [goneSince, setGoneSince] = useState<Record<string, number>>({});
  const [swapSel, setSwapSel] = useState<string | null>(null);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const now = useServerNow(500);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      // 이 조회 자체가 마감 지난 시도를 판정한다(서버 tick). 2초마다 → PRD 12절 ②
      setV(await api<View>(`/api/tournament/view?tid=${tid}`, { as: "teacher" }));
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) window.location.href = "/teacher/login";
      else setErr("연결을 다시 시도하는 중…");
    }
  }, [tid]);

  useEffect(() => {
    void syncClock();
    void load();
    const t = setInterval(load, 2000);
    let unsub = () => {};
    void teacherToken().then((token) => {
      if (!token) return;
      unsub = subscribe(`tournament:${tid}`, () => void load(), {
        token,
        presenceKey: "teacher",
        onPresence: (keys) => {
          const set = new Set(keys);
          setOnline(set);
          setGoneSince((g) => {
            const n = { ...g };
            for (const k of set) delete n[k];
            for (const k of seen.current) if (!set.has(k) && !n[k]) n[k] = Date.now();
            for (const k of set) seen.current.add(k);
            return n;
          });
        },
        onReconnect: load,
      });
    });
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [tid, load]);

  const act = async (path: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/api/tournament/${path}`, { as: "teacher", body: { tid, ...body } });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "실패했어요");
    }
  };

  if (!v) return <div className="p-6 text-2xl">{err ?? "불러오는 중…"}</div>;
  const t = v.tournament;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = `${origin}/join?code=${t.joinCode}`;
  const name = (id: string | null | undefined) => v.players.find((p) => p.id === id)?.name ?? "?";
  const disconnected = (pid: string) => {
    const g = goneSince[pid];
    return !!g && Date.now() - g > 10_000;
  };
  const active = v.players.filter((p) => !p.kicked);

  return (
    <main className="mx-auto max-w-[1600px] p-3">
      <header className="mb-3 flex flex-wrap items-center gap-3 rounded-3xl bg-white p-3 shadow">
        <a href="/teacher" className="rounded-xl bg-slate-100 px-3 py-2 font-bold">
          ← 대시보드
        </a>
        <h1 className="text-2xl font-black">{t.name}</h1>
        <span className="rounded-lg bg-slate-100 px-2 py-1">{PRESETS[t.preset as Preset]?.label} · {t.timeLimitSec}초</span>
        <span className="rounded-lg bg-indigo-100 px-2 py-1 font-bold text-indigo-800">
          {t.status === "lobby" ? "참가 모집 중" : t.status === "finished" ? "종료" : `${roundName(t.currentRound, t.plannedRounds)} (${t.currentRound}/${t.plannedRounds})`}
        </span>
        <span className="text-lg">👥 {active.length}/24</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {t.status !== "lobby" ? (
            <a href={`/teacher/t/${tid}/watch`} className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white">
              👀 관전
            </a>
          ) : null}
          {v.screenActive ? (
            <button className="rounded-xl bg-rose-100 px-4 py-3 font-bold text-rose-800" onClick={() => act("screen/revoke", {}, "관객 화면을 닫을까요?").then(() => setScreenUrl(null))}>
              관객 화면 회수
            </button>
          ) : null}
          <button
            className="rounded-xl bg-amber-400 px-4 py-3 font-bold"
            onClick={async () => {
              const r = await api<{ token: string }>("/api/tournament/screen/open", { as: "teacher", body: { tid } });
              const url = `${origin}/screen/${r.token}`;
              setScreenUrl(url);
              await load();
            }}
            data-testid="open-screen"
          >
            📺 관객 화면 열기
          </button>
        </div>
      </header>
      {screenUrl ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-amber-50 p-3">
          <QR text={screenUrl} size={90} />
          <div className="min-w-0">
            <p className="font-bold">전자칠판에서 이 주소를 여세요 (로그인 필요 없음)</p>
            <a href={screenUrl} target="_blank" className="break-all text-indigo-700 underline" data-testid="screen-url">
              {screenUrl}
            </a>
          </div>
        </div>
      ) : null}
      {err ? <p className="mb-2 font-bold text-rose-700">{err}</p> : null}

      {t.status === "lobby" ? (
        <section className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="rounded-3xl bg-white p-5 text-center shadow">
            <p className="text-lg font-bold">참가 코드</p>
            <p className="font-mono text-6xl font-black tracking-widest" data-testid="join-code">
              {t.joinCode}
            </p>
            <div className="mt-3 flex justify-center">
              <QR text={joinUrl} size={220} label="대회 참가 QR" />
            </div>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow">
            <h2 className="text-2xl font-black">참가자 {active.length}명</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {active.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-lg">
                  <span className={`h-3 w-3 rounded-full ${online.has(p.id) ? "bg-green-500" : "bg-slate-300"}`} aria-label={online.has(p.id) ? "접속 중" : "접속 안 함"} />
                  {p.name}
                  <button className="h-10 w-10 rounded-full bg-white text-xl" aria-label={`${p.name} 내보내기`} onClick={() => act("admin", { action: "kick", playerId: p.id }, `${p.name}을(를) 내보낼까요?`)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="mt-6 h-16 w-full rounded-2xl bg-rose-500 text-2xl font-black text-white disabled:opacity-40"
              disabled={active.length < 2}
              onClick={() => act("admin", { action: "close_and_pair" }, "참가를 마감하고 1라운드 대진을 만들까요?")}
              data-testid="close-and-pair"
            >
              참가 마감 · 대진 만들기
            </button>
          </div>
        </section>
      ) : (
        <>
          {t.status === "finished" ? (
            <section className="mb-3 rounded-3xl bg-gradient-to-r from-amber-300 to-yellow-200 p-6 text-center shadow" data-testid="champion">
              <p className="text-2xl font-bold">🏆 우승</p>
              <p className="text-5xl font-black">{t.championName}</p>
              <p className="mt-2 text-base">관객 화면에도 우승 발표가 나와요</p>
            </section>
          ) : (
            <section className="mb-3 flex flex-wrap gap-2">
              <button className="h-14 rounded-2xl bg-green-600 px-5 text-xl font-black text-white" onClick={() => act("admin", { action: "start_all" })} data-testid="start-all">
                ▶ 이 라운드 모두 시작
              </button>
              {v.roundUntouched ? (
                <button className="h-14 rounded-2xl bg-white px-5 text-lg font-bold shadow" onClick={() => act("admin", { action: "reshuffle" }, "대진을 다시 섞을까요?")}>
                  🔀 다시 섞기
                </button>
              ) : null}
              <button
                className="h-14 rounded-2xl bg-indigo-600 px-5 text-lg font-black text-white disabled:opacity-40"
                disabled={!v.allRoundsConfirmed}
                onClick={() => act("admin", { action: "next_round" }, "다음 라운드 대진을 만들까요? 이번 라운드 결과는 더 바꿀 수 없어요.")}
                data-testid="next-round"
              >
                다음 라운드 대진 만들기 →
              </button>
              {v.roundUntouched ? <span className="self-center text-base text-slate-600">선수 이름을 차례로 두 번 누르면 자리를 바꿔요</span> : null}
            </section>
          )}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="match-cards">
            {v.current.map((m) => (
              <MatchCard
                key={m.id}
                m={m}
                now={now}
                name={name}
                disconnected={disconnected}
                screenFocus={t.screenMatchId === m.id}
                canSwap={v.roundUntouched}
                swapSel={swapSel}
                onSwap={(pid) => {
                  if (!swapSel) return setSwapSel(pid);
                  if (swapSel !== pid) void act("admin", { action: "swap", p1: swapSel, p2: pid });
                  setSwapSel(null);
                }}
                act={act}
                tid={tid}
              />
            ))}
          </section>
          <section className="mt-4 rounded-3xl bg-white p-4 shadow">
            <h2 className="mb-2 text-xl font-black">대진표</h2>
            <Bracket matches={v.bracket} plannedRounds={t.plannedRounds} survivors={t.survivors} currentRound={t.currentRound} highlight={t.screenMatchId} />
          </section>
        </>
      )}
    </main>
  );
}

function MatchCard({
  m,
  now,
  name,
  disconnected,
  screenFocus,
  canSwap,
  swapSel,
  onSwap,
  act,
  tid,
}: {
  m: MatchV;
  now: number;
  name: (id: string | null | undefined) => string;
  disconnected: (pid: string) => boolean;
  screenFocus: boolean;
  canSwap: boolean;
  swapSel: string | null;
  onSwap: (pid: string) => void;
  act: (path: string, body: Record<string, unknown>, confirmText?: string) => Promise<void>;
  tid: string;
}) {
  const a = m.attempt;
  const bye = !m.b;
  const rem = remainingMs(a, now);
  const started = a && a.status !== "ready";
  const beforeStart = a?.startAt != null && now < a.startAt;
  const status = (r: MatchV["a"]) => {
    if (!r) return "";
    if (r.kicked) return "내보냄";
    if (!started) return "준비";
    if (r.done) return `제출 완료 (${r.bestBlocks}블록)`;
    if (r.solved) return `성공! ${r.bestBlocks}블록`;
    return `생각 중 · 실행 ${r.runs}번`;
  };
  const layout = a?.layoutId ? LAYOUTS_BY_ID[a.layoutId] : null;
  const player = (r: MatchV["a"]) =>
    r ? (
      <div className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1 ${m.winnerId === r.playerId ? "bg-amber-100" : "bg-slate-50"}`}>
        <button
          disabled={!canSwap}
          onClick={() => onSwap(r.playerId)}
          className={`truncate text-left text-lg font-black ${swapSel === r.playerId ? "rounded bg-amber-300 px-1" : ""}`}
        >
          {m.winnerId === r.playerId ? "🏅 " : ""}
          {r.name}
        </button>
        <span className="flex items-center gap-1 text-sm">
          {disconnected(r.playerId) ? <span className="rounded bg-rose-600 px-1 font-bold text-white">접속 끊김</span> : null}
          <span className={r.solved ? "font-bold text-green-700" : "text-slate-600"}>{status(r)}</span>
        </span>
      </div>
    ) : null;

  return (
    <div className={`flex flex-col gap-2 rounded-3xl bg-white p-3 shadow ${screenFocus ? "ring-4 ring-amber-300" : ""}`} data-testid="match-card">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-500">경기 {m.slot + 1}</span>
        {bye ? (
          <span className="font-bold text-emerald-700">부전승</span>
        ) : (
          <span className="flex items-center gap-2">
            {a ? <span className="text-sm text-slate-500">시도 {a.attemptNo} · {a.grade}{layout ? ` · ${layout.id}` : ""}</span> : null}
            <span className={`rounded-lg px-2 text-xl font-black tabular-nums ${a?.status === "paused" ? "bg-amber-200" : rem !== null && rem < 30000 && rem > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100"}`}>
              {a?.status === "paused" ? "⏸ " : ""}
              {beforeStart ? "준비" : rem !== null ? fmtTime(rem) : "-"}
            </span>
          </span>
        )}
      </div>
      {player(m.a ?? null)}
      {player(m.b ?? null)}
      {m.winnerId && !bye ? (
        <p className="text-base">
          승: <b>{name(m.winnerId)}</b> · {REASON_TEXT[m.reason ?? ""] ?? ""} {m.confirmed ? "✅ 확정" : ""}
        </p>
      ) : null}
      {m.needsTeacher ? <p className="font-bold text-rose-700">완전 동점: 승자를 정하거나 재경기를 만들어 주세요</p> : null}
      {!bye && !m.locked ? (
        <div className="flex flex-wrap gap-1">
          {a?.status === "ready" ? (
            <button className="h-12 rounded-xl bg-green-600 px-3 font-black text-white" onClick={() => act("attempt/start", { attemptId: a.id })} data-testid="start-match">
              ▶ {a.attemptNo > 1 ? "재경기 시작" : "시작"}
            </button>
          ) : null}
          {a?.status === "playing" ? (
            <button className="h-12 rounded-xl bg-amber-300 px-3 font-bold" onClick={() => act("attempt/pause", { attemptId: a.id })}>
              ⏸ 멈춤
            </button>
          ) : null}
          {a?.status === "paused" ? (
            <button className="h-12 rounded-xl bg-amber-300 px-3 font-bold" onClick={() => act("attempt/resume", { attemptId: a.id })}>
              ▶ 재개
            </button>
          ) : null}
          {m.winnerId && !m.confirmed ? (
            <button className="h-12 rounded-xl bg-indigo-600 px-3 font-black text-white" onClick={() => act("match/confirm", { matchId: m.id })} data-testid="confirm">
              ✅ 결과 확정
            </button>
          ) : null}
          <details className="relative">
            <summary className="flex h-12 cursor-pointer list-none items-center rounded-xl bg-slate-100 px-3 font-bold">더보기 ▾</summary>
            <div className="absolute z-20 mt-1 flex w-56 flex-col gap-1 rounded-2xl bg-white p-2 shadow-xl">
              {[m.a, m.b].map((r) =>
                r ? (
                  <button key={r.playerId} className="rounded-lg bg-slate-50 p-2 text-left" onClick={() => act("match/winner", { matchId: m.id, winnerId: r.playerId }, `${r.name} 승으로 정할까요?`)}>
                    🏅 {r.name} 승으로
                  </button>
                ) : null,
              )}
              {[m.a, m.b].map((r) =>
                r ? (
                  <button key={"f" + r.playerId} className="rounded-lg bg-slate-50 p-2 text-left" onClick={() => act("match/forfeit", { matchId: m.id, loserId: r.playerId }, `${r.name} 기권 처리할까요?`)}>
                    🏳️ {r.name} 기권
                  </button>
                ) : null,
              )}
              {a?.status !== "ready" ? (
                <button className="rounded-lg bg-slate-50 p-2 text-left" onClick={() => act("match/rematch", { matchId: m.id }, "재경기 시도를 만들까요?")}>
                  🔁 재경기 만들기
                </button>
              ) : null}
              <button className="rounded-lg bg-slate-50 p-2 text-left" onClick={() => act("admin", { action: "screen_focus", matchId: screenFocus ? "" : m.id })}>
                📺 {screenFocus ? "관객 화면에서 내리기" : "관객 화면에 띄우기"}
              </button>
              <a className="rounded-lg bg-slate-50 p-2" href={`/teacher/t/${tid}/watch?match=${m.id}`}>
                👀 관전 열기
              </a>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
