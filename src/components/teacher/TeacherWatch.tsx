"use client";
import { useCallback, useEffect, useState } from "react";
import { api, teacherToken } from "@/lib/api";
import { syncClock } from "@/lib/clock";
import { MatchSpectate } from "../tournament/MatchSpectate";
import type { MatchV, THeader } from "../tournament/types";

interface View {
  tournament: THeader;
  current: MatchV[];
}

/** 교사 관전 (보조 화면): 단일 경기 또는 최대 4경기 격자 */
export function TeacherWatch({ tid }: { tid: string }) {
  const [token, setToken] = useState("");
  const [v, setV] = useState<View | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [grid, setGrid] = useState(false);

  useEffect(() => {
    void syncClock();
    void teacherToken().then((t) => {
      if (t) setToken(t);
      else window.location.href = "/teacher/login";
    });
    setFocus(new URL(window.location.href).searchParams.get("match"));
  }, []);

  const load = useCallback(async () => setV(await api<View>(`/api/tournament/view?tid=${tid}`, { as: "teacher" })), [tid]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const matches = (v?.current ?? []).filter((m) => m.b);
  const liveFirst = [...matches].sort((a, b) => Number(b.attempt?.status === "playing") - Number(a.attempt?.status === "playing"));
  const single = focus ?? liveFirst[0]?.id ?? null;
  const snap = (mid: string) => () => api<{ match: MatchV; tournament: THeader }>(`/api/tournament/match/snapshot?tid=${tid}&matchId=${mid}`, { as: "teacher" });

  const act = async (path: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/tournament/${path}`, { as: "teacher", body: { tid, ...body } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "실패");
    }
  };

  return (
    <main className="flex h-dvh flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <a href={`/teacher/t/${tid}`} className="rounded-xl bg-white px-3 py-2 font-bold shadow">
          ← 대회 운영
        </a>
        <h1 className="text-xl font-black">{v?.tournament.name} · 관전</h1>
        <button onClick={() => setGrid(false)} className={`rounded-xl px-3 py-2 font-bold ${!grid ? "bg-indigo-600 text-white" : "bg-white"}`}>
          단일 경기
        </button>
        <button onClick={() => setGrid(true)} className={`rounded-xl px-3 py-2 font-bold ${grid ? "bg-indigo-600 text-white" : "bg-white"}`}>
          4경기 격자
        </button>
        <div className="flex flex-wrap gap-1">
          {matches.map((m) => (
            <button key={m.id} onClick={() => { setFocus(m.id); setGrid(false); }} className={`rounded-lg px-2 py-1 text-sm ${single === m.id && !grid ? "bg-amber-300" : "bg-white"}`}>
              {m.a?.name} vs {m.b?.name}
            </button>
          ))}
        </div>
      </header>
      {!token ? null : grid ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
          {liveFirst.slice(0, 4).map((m) => (
            <button key={m.id} className="min-h-0 overflow-hidden rounded-2xl bg-slate-200 p-1 text-left" onClick={() => { setFocus(m.id); setGrid(false); }}>
              <MatchSpectate tid={tid} matchId={m.id} token={token} fetchSnap={snap(m.id)} compact />
            </button>
          ))}
        </div>
      ) : single ? (
        <div className="min-h-0 flex-1">
          <MatchSpectate
            key={single}
            tid={tid}
            matchId={single}
            token={token}
            fetchSnap={snap(single)}
            controls={(m) =>
              m.locked ? null : (
                <div className="flex justify-center gap-2 text-sm">
                  {m.attempt?.status === "playing" ? <button className="rounded-lg bg-white px-3 py-2 shadow" onClick={() => act("attempt/pause", { attemptId: m.attempt!.id })}>일시정지</button> : null}
                  {m.attempt?.status === "paused" ? <button className="rounded-lg bg-white px-3 py-2 shadow" onClick={() => act("attempt/resume", { attemptId: m.attempt!.id })}>재개</button> : null}
                  <button className="rounded-lg bg-white px-3 py-2 shadow" onClick={() => confirm("재경기를 만들까요?") && act("match/rematch", { matchId: m.id })}>재경기</button>
                  {[m.a, m.b].map((r) => (r ? <button key={r.playerId} className="rounded-lg bg-white px-3 py-2 shadow" onClick={() => confirm(`${r.name} 승?`) && act("match/winner", { matchId: m.id, winnerId: r.playerId })}>{r.name} 승</button> : null))}
                </div>
              )
            }
          />
        </div>
      ) : (
        <p className="p-6 text-2xl text-slate-500">진행 중인 경기가 없어요</p>
      )}
    </main>
  );
}
