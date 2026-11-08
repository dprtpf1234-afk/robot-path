"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { anonToken, api, ApiError } from "@/lib/api";
import { syncClock } from "@/lib/clock";
import { readJson } from "@/lib/local";
import { subscribe } from "@/lib/rt";
import { Bracket } from "./Bracket";
import type { JoinedInfo } from "./JoinForm";
import { LobbyV } from "./types";

export function Lobby({ code }: { code: string }) {
  const [info, setInfo] = useState<JoinedInfo | null>(null);
  const [data, setData] = useState<LobbyV | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const went = useRef(false);

  useEffect(() => {
    const i = readJson<JoinedInfo | null>(`join:${code}`, null);
    if (!i) {
      window.location.href = `/join?code=${code}`;
      return;
    }
    setInfo(i);
    void syncClock();
  }, [code]);

  const load = useCallback(async () => {
    if (!info) return;
    try {
      const d = await api<LobbyV>(`/api/tournament/lobby?tid=${info.tid}`);
      setData(d);
      setErr(null);
      const st = d.myMatch?.attempt?.status;
      if (d.myMatch && st && ["countdown", "playing", "paused"].includes(st) && !went.current) {
        went.current = true;
        window.location.href = `/t/${code}/match/${d.myMatch.id}`;
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) window.location.href = `/join?code=${code}`;
      else setErr("연결을 다시 시도하는 중…");
    }
  }, [info, code]);

  // 표시용 실시간 + 3초 폴링(놓친 이벤트 보정)
  useEffect(() => {
    if (!info) return;
    void load();
    const t = setInterval(load, 3000);
    let unsub = () => {};
    let unsubMatch = () => {};
    void anonToken().then((token) => {
      unsub = subscribe(`tournament:${info.tid}`, () => void load(), { token, presenceKey: data?.me.id ?? undefined, onReconnect: load });
    });
    return () => {
      clearInterval(t);
      unsub();
      unsubMatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, load, data?.me.id]);

  const myMatchId = data?.myMatch?.id;
  useEffect(() => {
    if (!myMatchId) return;
    let unsub = () => {};
    void anonToken().then((token) => {
      unsub = subscribe(`match:${myMatchId}`, () => void load(), { token });
    });
    return () => unsub();
  }, [myMatchId, load]);

  if (!info || !data) return <div className="flex h-dvh items-center justify-center text-2xl">{err ?? "대기실에 들어가는 중…"}</div>;
  const t = data.tournament;
  const mm = data.myMatch;
  const oppName = mm ? (mm.opponent?.name ?? null) : null;
  let status: string;
  if (data.me.kicked) status = "대회에서 나가게 되었어요";
  else if (t.status === "finished") status = t.championId === data.me.id ? "🏆 우승! 축하해요!" : `🏆 우승: ${t.championName}`;
  else if (data.me.eliminatedRound) status = "이번 대회는 여기까지! 응원해 주세요 📣";
  else if (t.status === "lobby") status = "선생님이 시작하기를 기다려요";
  else if (mm && !mm.opponent) status = "이번 라운드는 부전승! 다음 라운드를 기다려요";
  else if (mm?.winnerId === data.me.id) status = mm.confirmed ? "이겼어요! 다음 라운드를 기다려요" : "이겼어요! 선생님이 확인 중이에요";
  else if (mm?.winnerId) status = "아쉬워요! 잘했어요 👏";
  else if (mm?.attempt?.status === "ready") status = mm.attempts > 1 ? "재경기 준비 중! 곧 시작해요" : "곧 시작해요! 준비하세요";
  else status = "다음 경기를 기다려요";

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <a href="/" className="rounded-xl bg-white px-4 py-3 text-lg font-bold shadow">
          ← 홈
        </a>
        <h1 className="text-2xl font-black sm:text-3xl">{t.name}</h1>
        <span className="rounded-xl bg-white px-3 py-2 text-lg shadow">👥 {t.playerCount}명</span>
        {t.currentRound ? <span className="rounded-xl bg-indigo-100 px-3 py-2 text-lg font-bold text-indigo-800">{t.currentRound}라운드</span> : null}
      </header>
      <section className="rounded-3xl bg-white p-5 text-center shadow" data-testid="lobby-status">
        <p className="text-lg text-slate-600">
          나: <b className="text-2xl text-ink">{data.me.name}</b>
        </p>
        {oppName && !mm?.winnerId ? (
          <p className="mt-2 text-2xl font-black">
            다음 상대: <span className="text-rose-600">{oppName}</span>
          </p>
        ) : null}
        <p className="mt-3 text-2xl font-black text-indigo-800">{status}</p>
        {mm && mm.attempt && ["countdown", "playing", "paused"].includes(mm.attempt.status) ? (
          <a href={`/t/${code}/match/${mm.id}`} className="mt-4 inline-flex h-14 items-center rounded-2xl bg-rose-500 px-6 text-xl font-black text-white">
            경기 화면으로 →
          </a>
        ) : null}
      </section>
      {t.status === "lobby" ? (
        <section className="rounded-3xl bg-white p-4 shadow">
          <h2 className="mb-2 text-xl font-black">참가자</h2>
          <ul className="flex flex-wrap gap-2">
            {data.players.map((p) => (
              <li key={p.id} className={`rounded-full px-3 py-1 text-lg ${p.id === data.me.id ? "bg-indigo-600 text-white" : "bg-slate-100"}`}>
                {p.name}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-3xl bg-white p-4 shadow">
          <h2 className="mb-2 text-xl font-black">대진표</h2>
          <Bracket matches={data.bracket} plannedRounds={t.plannedRounds} survivors={t.survivors} currentRound={t.currentRound} highlight={mm?.id} />
        </section>
      )}
    </main>
  );
}
