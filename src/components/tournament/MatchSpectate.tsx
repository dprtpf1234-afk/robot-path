"use client";
/* 관전: 화면 영상을 받지 않고 프로그램만 받아 같은 엔진으로 똑같이 재생한다 (항상 1배속, 새 실행이 오면 이전 재생을 멈춤) */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placeLayout, toGameMap } from "@/engine/map";
import { countBlocks } from "@/engine/program";
import type { Program } from "@/engine/types";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { THEMES_BY_ID } from "@/content/themes";
import { useServerNow } from "@/lib/clock";
import { subscribe } from "@/lib/rt";
import { MapView } from "../game/MapView";
import { StaticProgram } from "../game/StaticProgram";
import { usePlayback } from "../game/usePlayback";
import { fmtTime, MatchV, REASON_TEXT, RecV, remainingMs, THeader } from "./types";

export function MatchSpectate({
  tid,
  matchId,
  token,
  fetchSnap,
  compact = false,
  controls,
}: {
  tid: string;
  matchId: string;
  token: string;
  fetchSnap: () => Promise<{ match: MatchV; tournament: THeader }>;
  compact?: boolean;
  controls?: (m: MatchV) => React.ReactNode;
}) {
  const [m, setM] = useState<MatchV | null>(null);
  const [t, setT] = useState<THeader | null>(null);
  const [live, setLive] = useState<Record<string, { program: Program; version: number }>>({});
  const [runs, setRuns] = useState<Record<string, { runId: string; program: Program } | null>>({});
  const now = useServerNow(300);
  const lastAttempt = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchSnap();
      setM(d.match);
      setT(d.tournament);
      if (d.match?.attempt?.id !== lastAttempt.current) {
        lastAttempt.current = d.match?.attempt?.id ?? null;
        setLive({});
        setRuns({});
      }
    } catch {}
  }, [fetchSnap]);

  useEffect(() => {
    void load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  const pa = m?.a?.playerId;
  const pb = m?.b?.playerId;
  useEffect(() => {
    if (!token) return;
    const subs = [subscribe(`match:${matchId}`, () => void load(), { token, onReconnect: load })];
    for (const pid of [pa, pb]) {
      if (!pid) continue;
      subs.push(
        subscribe(
          `match:${matchId}:watch:${pid}`,
          (event, payload) => {
            const program = payload.program as Program;
            const version = Number(payload.version ?? 0);
            setLive((l) => (l[pid] && l[pid].version > version ? l : { ...l, [pid]: { program, version } }));
            if (event === "run_started") setRuns((r) => ({ ...r, [pid]: { runId: String(payload.run_id), program } }));
          },
          { token },
        ),
      );
    }
    return () => subs.forEach((u) => u());
  }, [matchId, token, pa, pb, load]);

  const a = m?.attempt ?? null;
  const layout = a?.layoutId ? LAYOUTS_BY_ID[a.layoutId] : null;
  const placed = useMemo(() => (layout && a?.variant ? placeLayout(layout, a.variant) : null), [layout, a?.variant]);
  if (!m || !t) return <div className="p-6 text-2xl">불러오는 중…</div>;
  const theme = THEMES_BY_ID[a?.themeId ?? "space"] ?? THEMES_BY_ID.space;
  const rem = remainingMs(a, now);
  const winner = m.winnerId ? (m.a?.playerId === m.winnerId ? m.a : m.b) : null;

  return (
    <div className={`flex h-full min-h-0 flex-col ${compact ? "gap-1" : "gap-3"}`} data-testid="spectate">
      <div className="flex items-center justify-center gap-4 text-center">
        <span className={`${compact ? "text-base" : "text-2xl"} font-bold`}>{m.round}라운드</span>
        <span className={`${compact ? "text-2xl" : "text-6xl"} font-black tabular-nums`} data-testid="spectate-timer">
          {a?.status === "paused" ? "⏸ " : ""}
          {rem !== null ? fmtTime(rem) : "--:--"}
        </span>
        <span className={`${compact ? "text-base" : "text-2xl"} font-bold`}>시도 {a?.attemptNo ?? 1}</span>
      </div>
      {winner ? (
        <div className={`pop rounded-3xl bg-gradient-to-r from-amber-300 to-yellow-200 p-3 text-center ${compact ? "text-xl" : "text-4xl"} font-black`}>
          🏆 {winner.name} 승! <span className="text-xl font-bold">({REASON_TEXT[m.reason ?? ""]})</span>
        </div>
      ) : a?.status === "ready" && m.attempts > 1 ? (
        <div className="rounded-3xl bg-amber-100 p-3 text-center text-2xl font-black">🔁 재경기 준비 중</div>
      ) : null}
      <div className={`grid min-h-0 flex-1 grid-cols-2 ${compact ? "gap-2" : "gap-4"}`}>
        {placed ? (
          [m.a, m.b].map((r) =>
            r ? (
              <PlayerPane
                key={r.playerId + (a?.id ?? "")}
                rec={r}
                placed={placed}
                theme={theme}
                live={live[r.playerId]?.program ?? r.lastProgram ?? null}
                run={runs[r.playerId] ?? null}
                compact={compact}
                isWinner={m.winnerId === r.playerId}
              />
            ) : null,
          )
        ) : (
          <p className="col-span-2 self-center text-center text-2xl text-slate-500">경기 시작을 기다려요</p>
        )}
      </div>
      {controls ? controls(m) : null}
      <input type="hidden" value={tid} readOnly />
    </div>
  );
}

function PlayerPane({
  rec,
  placed,
  theme,
  live,
  run,
  compact,
  isWinner,
}: {
  rec: RecV;
  placed: ReturnType<typeof placeLayout>;
  theme: (typeof THEMES_BY_ID)[string];
  live: Program | null;
  run: { runId: string; program: Program } | null;
  compact: boolean;
  isWinner: boolean;
}) {
  const map = useMemo(() => toGameMap(placed), [placed]);
  const pb = usePlayback(map, { sound: false });
  const shownFinal = useRef(false);
  // 중간 입장: 마지막 실행 결과 위치를 바로 그린다
  useEffect(() => {
    if (!shownFinal.current && rec.lastProgram) {
      shownFinal.current = true;
      pb.showFinal(rec.lastProgram);
    }
  }, [rec.lastProgram, pb]);
  // 새 실행이 오면 이전 재생을 멈추고 1배속으로 새로 시작
  useEffect(() => {
    if (run) void pb.play(run.program, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.runId]);
  const program = run && pb.playing ? run.program : live;
  return (
    <div className={`flex min-h-0 flex-col rounded-3xl bg-white ${compact ? "p-2" : "p-3"} shadow ${isWinner ? "ring-4 ring-amber-300" : ""} ${rec.solved ? "outline outline-4 outline-green-400" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className={`${compact ? "text-lg" : "text-3xl"} truncate font-black`}>{rec.name}</h3>
        <span className={`${compact ? "text-sm" : "text-xl"} font-bold ${rec.solved ? "text-green-700" : "text-slate-500"}`}>
          {rec.done ? "제출 완료" : rec.solved ? "성공!" : pb.playing ? "실행 중" : "생각 중"}
        </span>
      </div>
      <div className={`flex min-h-0 flex-1 ${compact ? "flex-col" : "flex-col xl:flex-row"} gap-2`}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <MapView placed={placed} theme={theme} robot={pb.robot} anim={pb.anim} stepMs={pb.stepMs} trail={pb.trail} />
        </div>
        {!compact ? (
          <div className="max-h-[40vh] min-w-0 overflow-y-auto xl:max-h-none xl:w-64">
            {program && program.length ? <StaticProgram program={program} activePath={pb.activePath} failPath={pb.failPath} size="sm" /> : <p className="text-slate-400">블록 조립 중…</p>}
          </div>
        ) : null}
      </div>
      <div className={`mt-1 flex justify-between ${compact ? "text-sm" : "text-xl"}`}>
        <span>실행 {rec.runs}번{program ? ` · 지금 ${countBlocks(program)}블록` : ""}</span>
        <span className="font-bold">
          최고 {rec.bestBlocks != null ? `${rec.bestBlocks}블록 · ${((rec.bestElapsedMs ?? 0) / 1000).toFixed(1)}초` : "-"}
        </span>
      </div>
    </div>
  );
}
