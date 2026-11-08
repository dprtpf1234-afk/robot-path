"use client";
/* 관객 화면 (/screen/[token]): 교사 로그인 없이 읽기 전용. 교사가 고른 경기를 따라가고, 경기가 없으면 대진표. */
import { useCallback, useEffect, useState } from "react";
import { anonToken, api, ApiError } from "@/lib/api";
import { syncClock } from "@/lib/clock";
import { subscribe } from "@/lib/rt";
import { Bracket, BracketMatch } from "./Bracket";
import { MatchSpectate } from "./MatchSpectate";
import type { MatchV, THeader } from "./types";

interface ScreenV {
  tournament: THeader;
  bracket: BracketMatch[];
  match: MatchV | null;
}

export function Screen({ token: linkToken }: { token: string }) {
  const [tid, setTid] = useState<string | null>(null);
  const [auth, setAuth] = useState("");
  const [v, setV] = useState<ScreenV | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    void syncClock();
    (async () => {
      try {
        const tk = await anonToken();
        const r = await api<{ tid: string }>("/api/tournament/screen/verify", { body: { token: linkToken } });
        setAuth(tk);
        setTid(r.tid);
      } catch (e) {
        setClosed(e instanceof ApiError ? e.message : "연결하지 못했어요");
      }
    })();
  }, [linkToken]);

  const load = useCallback(async () => {
    if (!tid) return;
    try {
      setV(await api<ScreenV>(`/api/tournament/screen/state?tid=${tid}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setClosed("관객 화면이 닫혔어요");
    }
  }, [tid]);

  useEffect(() => {
    if (!tid || !auth) return;
    void load();
    const t = setInterval(load, 4000);
    const unsub = subscribe(
      `tournament:${tid}`,
      (event) => {
        if (event === "screen_closed") setClosed("관객 화면이 닫혔어요");
        else void load();
      },
      { token: auth, onReconnect: load },
    );
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [tid, auth, load]);

  if (closed) return <div className="flex h-dvh items-center justify-center bg-slate-900 text-4xl font-black text-white" data-testid="screen-closed">{closed}</div>;
  if (!v || !tid) return <div className="flex h-dvh items-center justify-center bg-slate-900 text-3xl text-white">연결 중…</div>;
  const t = v.tournament;

  if (t.status === "finished") {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-indigo-900 to-indigo-700 text-white" data-testid="screen-champion">
        <p className="text-5xl">🏆</p>
        <p className="text-4xl font-bold">{t.name} 우승</p>
        <p className="pop text-8xl font-black text-yellow-300 drop-shadow-lg">{t.championName}</p>
        <p className="text-2xl">모두 수고했어요! 👏</p>
      </main>
    );
  }
  return (
    <main className="flex h-dvh flex-col gap-3 bg-slate-100 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">{t.name}</h1>
        <span className="text-2xl font-bold text-slate-600">{t.status === "lobby" ? `참가 코드 ${t.joinCode} · ${t.playerCount}명` : `생존자 ${t.survivors}명`}</span>
      </header>
      {v.match && v.match.attempt ? (
        <div className="min-h-0 flex-1">
          <MatchSpectate
            key={v.match.id}
            tid={tid}
            matchId={v.match.id}
            token={auth}
            fetchSnap={() => api<{ match: MatchV; tournament: THeader }>(`/api/tournament/match/snapshot?tid=${tid}&matchId=${v.match!.id}`)}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-3xl bg-white p-4">
          <Bracket matches={v.bracket} plannedRounds={t.plannedRounds} survivors={t.survivors} currentRound={t.currentRound} big />
        </div>
      )}
    </main>
  );
}
