"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placeLayout } from "@/engine/map";
import type { Program } from "@/engine/types";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { THEMES_BY_ID } from "@/content/themes";
import { anonToken, api, ApiError } from "@/lib/api";
import { syncClock, useServerNow } from "@/lib/clock";
import { randomHex, readJson, removeKey, writeJson } from "@/lib/local";
import { sendWatch, subscribe } from "@/lib/rt";
import { GameBoard } from "../game/GameBoard";
import { countE, fromProgram, useEditor } from "../game/editorStore";
import type { JoinedInfo } from "./JoinForm";
import { fmtTime, MatchV, REASON_TEXT, remainingMs, THeader } from "./types";

interface Snap {
  match: MatchV;
  tournament: THeader;
  serverNow: number;
}

export function MatchPlay({ code, matchId }: { code: string; matchId: string }) {
  const [info, setInfo] = useState<JoinedInfo | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [oppRunning, setOppRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const now = useServerNow(200);
  const token = useRef<string>("");
  const version = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const judging = useRef<string | null>(null);

  useEffect(() => {
    const i = readJson<JoinedInfo | null>(`join:${code}`, null);
    if (!i) {
      window.location.href = `/join?code=${code}`;
      return;
    }
    setInfo(i);
    void syncClock();
    void anonToken().then((t) => (token.current = t));
  }, [code]);

  const load = useCallback(async () => {
    if (!info) return;
    try {
      const d = await api<Snap>(`/api/tournament/match/snapshot?tid=${info.tid}&matchId=${matchId}`);
      setSnap(d);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) window.location.href = `/t/${code}`;
    }
  }, [info, matchId, code]);

  useEffect(() => {
    if (!info) return;
    void load();
    const t = setInterval(load, 4000);
    let unsub = () => {};
    void anonToken().then((tk) => {
      // 상태를 바꾸는 이벤트를 받으면 서버 값을 다시 읽어 확인한 뒤 화면을 바꾼다
      unsub = subscribe(
        `match:${matchId}`,
        (event, payload) => {
          if (event === "run_result" && payload.player_id !== snapRef.current?.match.me?.playerId) {
            setOppRunning(true);
            setTimeout(() => setOppRunning(false), 1500);
          }
          void load();
        },
        { token: tk, onReconnect: load },
      );
    });
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [info, load, matchId]);

  const snapRef = useRef<Snap | null>(null);
  snapRef.current = snap;

  // 접속 상태(Presence): 경기 화면에서도 대회 채널에 내 상태를 알린다 (교사 화면의 「접속 끊김」 경고용)
  const myPlayerId = snap?.match.me?.playerId;
  useEffect(() => {
    if (!info || !myPlayerId) return;
    let unsub = () => {};
    void anonToken().then((tk) => {
      unsub = subscribe(`tournament:${info.tid}`, () => {}, { token: tk, presenceKey: myPlayerId });
    });
    return () => unsub();
  }, [info, myPlayerId]);

  const m = snap?.match;
  const a = m?.attempt ?? null;
  const me = m?.me ?? null;
  const opp = m?.opponent ?? null;
  const layout = a?.layoutId ? LAYOUTS_BY_ID[a.layoutId] : null;
  const placed = useMemo(() => (layout && a?.variant ? placeLayout(layout, a.variant) : null), [layout, a?.variant]);
  const theme = THEMES_BY_ID[a?.themeId ?? "space"] ?? THEMES_BY_ID.space;

  // 시도가 바뀌면 그 시도의 저장된 프로그램만 되살린다 (다른 시도의 프로그램은 버린다)
  const attemptId = a?.id;
  useEffect(() => {
    if (!attemptId) return;
    const saved = readJson<{ attemptId: string; program: Program } | null>(`tprog:${matchId}`, null);
    if (saved && saved.attemptId === attemptId) useEditor.getState().reset(fromProgram(saved.program));
    else {
      removeKey(`tprog:${matchId}`);
      useEditor.getState().reset([]);
    }
    version.current = 0;
  }, [attemptId, matchId]);

  const remaining = remainingMs(a, now);
  const beforeStart = a?.startAt != null && now < a.startAt;
  const live = !!a && (a.status === "playing" || a.status === "countdown") && !beforeStart && remaining !== null && remaining > 0;
  const canRun = live && !me?.done && a?.status !== "paused";

  // 마감·양쪽 제출 완료 시 판정 요청 (멱등)
  useEffect(() => {
    if (!info || !a || a.status === "done" || a.status === "ready") return;
    const timeUp = a.endsAt !== null && now > a.endsAt + 300 && a.status !== "paused";
    const bothDone = me?.done && opp?.done;
    if ((timeUp || bothDone) && judging.current !== a.id) {
      judging.current = a.id;
      void api("/api/tournament/attempt/judge", { body: { tid: info.tid, attemptId: a.id } })
        .then(load)
        .catch(() => (judging.current = null));
    }
  }, [now, a, me?.done, opp?.done, info, load]);

  const onProgramChange = useCallback(
    (p: Program) => {
      if (!attemptId || !me) return;
      writeJson(`tprog:${matchId}`, { attemptId, program: p });
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        version.current++;
        if (token.current) void sendWatch(`match:${matchId}:watch:${me.playerId}`, "program_changed", { program: p, version: version.current }, token.current);
      }, 300);
    },
    [attemptId, matchId, me],
  );

  const onRunStart = useCallback(
    (p: Program) => {
      if (!info || !a || !me) return;
      const runId = randomHex(12);
      version.current++;
      if (token.current) void sendWatch(`match:${matchId}:watch:${me.playerId}`, "run_started", { run_id: runId, program: p, version: version.current }, token.current);
      // 실행을 누른 순간 서버로 제출. 애니메이션은 화면에서만 재생.
      const send = (tries: number): Promise<void> =>
        api<{ solved: boolean; blocks: number }>("/api/tournament/attempt/run", { body: { tid: info.tid, attemptId: a.id, runId, program: p } })
          .then(() => load())
          .catch((e) => {
            if (e instanceof ApiError && e.status < 500) {
              setToast(e.message);
              setTimeout(() => setToast(null), 2500);
            } else if (tries < 3) return new Promise((r) => setTimeout(r, 500 * (tries + 1))).then(() => send(tries + 1)); // 같은 실행 id로 재전송 → 한 번만 반영
          });
      void send(0);
    },
    [info, a, me, matchId, load],
  );

  const markDone = async () => {
    if (!info || !a) return;
    try {
      await api("/api/tournament/attempt/done", { body: { tid: info.tid, attemptId: a.id } });
      await load();
    } catch (e) {
      if (e instanceof ApiError) setToast(e.message);
    }
  };

  if (!snap || !m) return <div className="flex h-dvh items-center justify-center text-2xl">경기장에 들어가는 중…</div>;

  // 결과 · 대기 화면
  const ended = m.winnerId || m.needsTeacher || !a || a.status === "ready" || a.status === "done";
  if (ended || !placed || !layout) {
    let title = "잠시 기다려요";
    let sub = "";
    if (m.winnerId) {
      const win = m.winnerId === me?.playerId;
      title = win ? "🎉 이겼어요!" : "아쉬워요! 잘했어요 👏";
      sub = `${REASON_TEXT[m.reason ?? ""] ?? ""}${m.confirmed ? "" : " · 선생님 확인 중"}`;
    } else if (m.needsTeacher) {
      title = "완전 동점! 선생님이 정해요";
    } else if (a?.status === "ready") {
      title = m.attempts > 1 ? "🔁 재경기를 준비해요" : "곧 시작해요!";
      sub = m.attempts > 1 ? "둘 다 아직 도착하지 못했어요. 조금 더 쉬운 맵으로 다시!" : "선생님이 시작 버튼을 누르면 시작해요";
    }
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" data-testid="match-wait">
        <h1 className="text-4xl font-black">{title}</h1>
        {sub ? <p className="text-xl text-slate-600">{sub}</p> : null}
        {me?.bestBlocks ? <p className="text-xl">내 기록: 블록 {me.bestBlocks}개</p> : null}
        <a href={`/t/${code}`} className="mt-4 rounded-2xl bg-indigo-600 px-6 py-4 text-xl font-bold text-white">
          대기실로
        </a>
      </main>
    );
  }

  const oppStatus = opp?.done ? "제출 완료" : oppRunning ? "실행 중…" : opp?.solved ? "성공!" : "생각 중";
  const low = remaining !== null && remaining < 30_000;
  const header = (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
      <span className="text-xl font-black">{m.round}라운드</span>
      {m.attempts > 1 ? <span className="rounded-lg bg-amber-100 px-2 text-base font-bold text-amber-800">재경기 {m.attempts - 1}</span> : null}
      <span
        className={`rounded-xl px-3 py-1 text-3xl font-black tabular-nums ${low ? "bg-rose-100 text-rose-700" : "bg-white"}`}
        data-testid="timer"
        aria-label="남은 시간"
      >
        {a.status === "paused" ? "⏸ " : ""}
        {remaining !== null ? fmtTime(remaining) : "-"}
      </span>
      <span className="rounded-lg bg-white px-2 py-1 text-base shadow-sm">목표 {layout.target}블록</span>
      <span className="ml-auto rounded-xl bg-white px-3 py-1 text-base shadow" data-testid="opp-status">
        {opp?.name}: <b className={opp?.solved ? "text-green-700" : ""}>{oppStatus}</b>
      </span>
      {me?.solved ? (
        <span className="rounded-xl bg-green-100 px-3 py-1 text-base font-bold text-green-800">내 기록 {me.bestBlocks}블록</span>
      ) : null}
    </div>
  );

  const doneBtn = (
    <button
      onClick={markDone}
      disabled={!me?.solved || me.done}
      className="h-14 rounded-xl bg-amber-400 px-3 text-base font-black text-amber-950 shadow disabled:opacity-40"
      data-testid="done"
    >
      {me?.done ? "제출 완료!" : "제출 완료"}
    </button>
  );

  return (
    <div className="relative h-dvh overflow-hidden">
      <GameBoard
        key={a.id}
        placed={placed}
        theme={theme}
        allowedBlocks={layout.allowedBlocks}
        maxNesting={layout.maxNesting}
        header={header}
        extra={doneBtn}
        canRun={canRun}
        onRunStart={onRunStart}
        onProgramChange={onProgramChange}
        outcomeText={(r) => (r.outcome === "success" ? `성공! 블록 ${countE(useEditor.getState().program)}개 · 더 줄이거나 「제출 완료」` : null)}
      />
      {beforeStart && a.startAt ? <Countdown startAt={a.startAt} /> : null}
      {a.status === "paused" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 text-5xl font-black text-white">⏸ 잠시 멈춤</div>
      ) : null}
      {remaining === 0 && a.status !== "paused" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 text-5xl font-black text-white">⏰ 시간 끝! 판정 중…</div>
      ) : null}
      {toast ? <div className="pop fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-lg text-white">{toast}</div> : null}
    </div>
  );
}

function Countdown({ startAt }: { startAt: number }) {
  const now = useServerNow(100);
  const left = Math.ceil((startAt - now) / 1000);
  if (left <= 0) return null;
  const n = Math.min(3, left);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-indigo-900/70" aria-live="assertive">
      <span key={n} className="pop text-[10rem] font-black text-white drop-shadow-lg">
        {left > 3 ? "준비" : n}
      </span>
    </div>
  );
}

