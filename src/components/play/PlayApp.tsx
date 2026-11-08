"use client";
/* 개인 모드: /play 한 페이지 안에서 화면을 전환한다 (라우트 이동 없음 → 오프라인에서도 동작) */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placeLayout, solutionFor } from "@/engine/map";
import { countBlocks, usedBlockTypes } from "@/engine/program";
import { starsFor } from "@/engine/score";
import type { Program, RunResult } from "@/engine/types";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { CHAPTERS, STAGES, StageSpec, stageOf } from "@/content/stages";
import { THEMES_BY_ID } from "@/content/themes";
import { assignForStage } from "@/lib/assign";
import {
  Assignment,
  BestRecord,
  getEventCode,
  getHistory,
  getProgress,
  getSession,
  getSoundOn,
  isBetter,
  Progress,
  pushHistory,
  saveProgress,
  setEventCode,
  setSoundOn,
} from "@/lib/local";
import { DEMO } from "@/lib/demo";
import { enqueueStat, startAutoFlush } from "@/lib/sync";
import { GameBoard } from "../game/GameBoard";
import { MapView } from "../game/MapView";
import { BlockIcon } from "../game/BlockIcon";
import { fromProgram, useEditor } from "../game/editorStore";
import { Stars } from "../ui/Stars";
import { RegisterModal } from "./RegisterModal";

type Screen = { name: "chapters" } | { name: "game"; stageId: string } | { name: "chapterDone"; chapter: number };

interface Clear {
  stars: number;
  blocks: number;
  target: number;
  genius: boolean;
  concept: boolean;
  improved: boolean;
}

/** 60초 이상 입력이 없는 구간을 뺀 활동 시간 */
function useActiveTimer() {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const on = () => {
      const now = Date.now();
      if (last.current !== null) {
        const gap = now - last.current;
        if (gap < 60_000) acc.current += gap;
      }
      last.current = now;
    };
    window.addEventListener("pointerdown", on);
    return () => window.removeEventListener("pointerdown", on);
  }, []);
  return {
    restart: () => {
      acc.current = 0;
      last.current = Date.now();
    },
    take: () => {
      const now = Date.now();
      let v = acc.current;
      if (last.current !== null && now - last.current < 60_000) v += now - last.current;
      return v;
    },
  };
}

export function PlayApp() {
  const [screen, setScreen] = useState<Screen>({ name: "chapters" });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [register, setRegister] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setProgress(getProgress());
    setSound(getSoundOn());
    const url = new URL(window.location.href);
    const ev = url.searchParams.get("event");
    if (ev && /^[A-Z]{5}$/.test(ev.toUpperCase())) setEventCode(ev.toUpperCase());
    if (url.hash === "#register" && !DEMO) setRegister(true);
    return DEMO ? undefined : startAutoFlush();
  }, []);

  const update = useCallback((f: (p: Progress) => Progress) => {
    setProgress((p) => {
      const next = f(p ?? getProgress());
      saveProgress(next);
      return next;
    });
  }, []);

  if (!progress) return <div className="flex h-dvh items-center justify-center text-2xl">불러오는 중…</div>;

  const soundBtn = (
    <button
      className="chip3d h-12 min-w-12 rounded-xl px-2 text-xl"
      onClick={() => {
        setSoundOn(!sound);
        setSound(!sound);
      }}
      aria-label={sound ? "소리 끄기" : "소리 켜기"}
      aria-pressed={sound}
    >
      {sound ? "🔊" : "🔇"}
    </button>
  );

  return (
    <div className="h-dvh overflow-hidden">
      {screen.name === "chapters" ? (
        <ChapterSelect
          progress={progress}
          onPlay={(id) => setScreen({ name: "game", stageId: id })}
          onRegister={() => setRegister(true)}
          soundBtn={soundBtn}
        />
      ) : null}
      {screen.name === "game" ? (
        <StageScreen
          key={screen.stageId}
          stage={STAGES.find((s) => s.id === screen.stageId)!}
          progress={progress}
          update={update}
          soundBtn={soundBtn}
          onBack={() => setScreen({ name: "chapters" })}
          onNext={(s) => {
            const nxt = stageOf(s.chapter, s.stage + 1);
            setScreen(nxt ? { name: "game", stageId: nxt.id } : { name: "chapterDone", chapter: s.chapter });
          }}
        />
      ) : null}
      {screen.name === "chapterDone" ? (
        <ChapterDone
          chapter={screen.chapter}
          progress={progress}
          onRegister={() => setRegister(true)}
          onNextChapter={() => {
            const c = screen.chapter + 1;
            setScreen(c <= 3 ? { name: "game", stageId: `${c}-1` } : { name: "chapters" });
          }}
          onHome={() => setScreen({ name: "chapters" })}
        />
      ) : null}
      {register ? <RegisterModal progress={progress} onClose={() => setRegister(false)} /> : null}
    </div>
  );
}

const CHAPTER_TINT = { 1: "#a9cdf0", 2: "#f6c6a5", 3: "#a9dcc9" } as const;

const DIORAMA = { 1: { layout: "t1", theme: "space" }, 2: { layout: "t2", theme: "ocean" }, 3: { layout: "t3", theme: "forest" } } as const;

/** 챕터 카드 위의 작은 2.5D 미리보기 (그 장 튜토리얼 맵) */
function ChapterDiorama({ chapter }: { chapter: 1 | 2 | 3 }) {
  const d = DIORAMA[chapter];
  const placed = useMemo(() => placeLayout(LAYOUTS_BY_ID[d.layout], "orig"), [d.layout]);
  return (
    <div className="-mx-1 -mt-1 mb-3 h-36 overflow-hidden rounded-2xl sm:h-44" aria-hidden>
      <MapView placed={placed} theme={THEMES_BY_ID[d.theme]} robot={{ ...placed.start }} label={`${chapter}장 미리보기`} />
    </div>
  );
}

function unlocked(progress: Progress, s: StageSpec) {
  if (s.stage === 1) return true;
  const prev = stageOf(s.chapter, s.stage - 1)!;
  return !!progress.best[prev.id];
}

function ChapterSelect({
  progress,
  onPlay,
  onRegister,
  soundBtn,
}: {
  progress: Progress;
  onPlay: (id: string) => void;
  onRegister: () => void;
  soundBtn: React.ReactNode;
}) {
  const total = Object.values(progress.best).reduce((n, b) => n + b.stars, 0);
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        {DEMO ? null : (
          <a href="/" className="flex h-12 items-center rounded-xl bg-white px-4 text-lg font-bold shadow">
            ← 홈
          </a>
        )}
        <h1 className="flex-1 text-center text-2xl font-black tracking-tight sm:text-4xl">챕터를 골라요</h1>
        <span className="chip3d rounded-xl px-3 py-2 text-lg font-black" aria-label={`모은 별 ${total}개`}>
          ★ {total}
        </span>
        {soundBtn}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {CHAPTERS.map((c) => {
          const stages = STAGES.filter((s) => s.chapter === c.chapter);
          const stars = stages.reduce((n, s) => n + (progress.best[s.id]?.stars ?? 0), 0);
          return (
            <section key={c.chapter} className="panel3d rounded-3xl p-4" data-testid={`chapter-${c.chapter}`}>
              <ChapterDiorama chapter={c.chapter} />
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: CHAPTER_TINT[c.chapter] }} aria-hidden>
                  <BlockIcon t={c.chapter === 1 ? "forward" : c.chapter === 2 ? "repeat" : "ifWall"} size={30} />
                </span>
                <div>
                  <h2 className="text-2xl font-black">
                    {c.chapter}장 {c.title}
                  </h2>
                  <p className="text-base text-slate-600">
                    {c.concept} · ★ {stars}/15
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {stages.map((s) => {
                  const open = unlocked(progress, s);
                  const best = progress.best[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => open && onPlay(s.id)}
                      disabled={!open}
                      data-testid={`stage-${s.id}`}
                      className={`flex aspect-square min-h-14 flex-col items-center justify-center rounded-2xl text-xl font-black ${
                        open ? (best ? "blk3d bg-[#c9bdf0] text-[#3d3a5c]" : "blk3d bg-white text-[#3d3a5c]") : "bg-white/40 text-slate-400"
                      }`}
                      style={{ ["--blk-edge" as string]: best ? "#a28fd6" : "#ddd5f5" }}
                      aria-label={`${s.id} 단계${open ? "" : " (잠김)"}${best ? `, 별 ${best.stars}개` : ""}`}
                    >
                      {open ? (
                        s.stage
                      ) : (
                        <svg width="20" height="22" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                          <rect x="3" y="10" width="14" height="10" rx="3" />
                          <path d="M6.5 10 V7 a3.5 3.5 0 0 1 7 0 V10" />
                        </svg>
                      )}
                      <span className="text-xs leading-none">{best ? "★".repeat(best.stars) : " "}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-6 flex justify-center">
        {DEMO ? (
          <p className="text-center text-base text-slate-500">체험판: 기록은 이 브라우저에만 저장돼요. 랭킹·대회는 정식 사이트에서 열려요.</p>
        ) : (
        <button onClick={onRegister} className="blk3d h-14 rounded-2xl bg-[#f8e2a4] px-6 text-xl font-black" style={{ ["--blk-edge" as string]: "#dcbd6c" }}>
          🏆 랭킹에 등록하기
        </button>
        )}
      </div>
    </div>
  );
}

function StageScreen({
  stage,
  progress,
  update,
  onBack,
  onNext,
  soundBtn,
}: {
  stage: StageSpec;
  progress: Progress;
  update: (f: (p: Progress) => Progress) => void;
  onBack: () => void;
  onNext: (s: StageSpec) => void;
  soundBtn: React.ReactNode;
}) {
  const [assign, setAssign] = useState<Assignment | null>(null);
  const [clear, setClear] = useState<Clear | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const timer = useActiveTimer();
  const cleared = useRef(false);
  const fails = progress.fails[stage.id] ?? 0;

  // 배정: 저장된 배정이 있으면 유지 (다시 하기·새로고침), 없으면 새로 뽑는다
  const pick = useCallback(
    (fresh: boolean) => {
      const p = getProgress();
      const existing = p.current[stage.id];
      if (existing && !fresh && LAYOUTS_BY_ID[existing.layoutId]) return existing;
      const a = assignForStage(stage, getHistory(), p.lastThemeId, Math.random, existing ?? undefined);
      update((pp) => ({ ...pp, current: { ...pp.current, [stage.id]: a }, lastThemeId: a.themeId }));
      pushHistory({ ...a, at: Date.now() });
      return a;
    },
    [stage, update],
  );

  const sendStat = useCallback(
    (type: "start" | "clear" | "quit") => {
      const a = getProgress().current[stage.id];
      const layout = a ? LAYOUTS_BY_ID[a.layoutId] : null;
      enqueueStat({
        player_session: getSession().id,
        event_code: getEventCode(),
        type,
        chapter: stage.chapter,
        stage: stage.stage,
        grade: layout?.grade ?? "T",
        active_ms: type === "start" ? 0 : timer.take(),
      });
    },
    [stage, timer],
  );

  useEffect(() => {
    const a = pick(false);
    setAssign(a);
    const best = getProgress().best[stage.id];
    useEditor.getState().reset(best && best.layoutId === a.layoutId && best.variant === a.variant ? fromProgram(best.program) : []);
    timer.restart();
    sendStat("start");
    return () => {
      if (!cleared.current) sendStat("quit");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id]);

  const layout = assign ? LAYOUTS_BY_ID[assign.layoutId] : null;
  const placed = useMemo(() => (layout && assign ? placeLayout(layout, assign.variant) : null), [layout, assign]);
  const hint = useMemo(() => (layout && assign ? solutionFor(layout, assign.variant) : null), [layout, assign]);
  if (!assign || !layout || !placed) return null;
  const theme = THEMES_BY_ID[assign.themeId] ?? THEMES_BY_ID.space;
  const best = progress.best[stage.id];

  const onRunEnd = (r: RunResult, program: Program) => {
    if (r.outcome !== "success") {
      update((p) => ({ ...p, fails: { ...p.fails, [stage.id]: (p.fails[stage.id] ?? 0) + 1 } }));
      return;
    }
    const blocks = countBlocks(program);
    const stars = starsFor(true, blocks, layout.target);
    const rec: BestRecord = {
      layoutId: layout.id,
      variant: assign.variant,
      contentVersion: layout.contentVersion,
      program,
      stars,
      blocks,
      target: layout.target,
      at: Date.now(),
    };
    const used = usedBlockTypes(program);
    const concept = stage.chapter === 3 && ["ifWall", "ifColor", "untilGoal"].some((t) => used.has(t as never));
    const prev = getProgress().best[stage.id];
    const improved = isBetter(rec, prev);
    update((p) => {
      const badges = new Set(p.badges);
      if (blocks < layout.target) badges.add("genius");
      if (concept) badges.add(`concept-${stage.id}`);
      return { ...p, best: improved ? { ...p.best, [stage.id]: rec } : p.best, fails: { ...p.fails, [stage.id]: 0 }, badges: [...badges] };
    });
    if (!cleared.current) {
      cleared.current = true;
      sendStat("clear");
    }
    setClear({ stars, blocks, target: layout.target, genius: blocks < layout.target, concept, improved });
  };

  const header = (
    <div className="flex items-center gap-2 px-3 pt-2">
      <button onClick={onBack} className="chip3d h-12 rounded-xl px-3 text-lg font-bold" aria-label="챕터 고르기로">
        ←
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-black">{stage.id}</h1>
        <span className="text-base text-slate-600">
          {stage.concept} · {theme.name}
        </span>
        <span className="chip3d rounded-lg px-2 py-0.5 text-base font-bold" data-testid="target">
          {layout.targetVerified ? "최적" : "목표"} {layout.target}블록
        </span>
        {best ? <span className="text-base text-[#c4895a]">{"★".repeat(best.stars)}</span> : null}
      </div>
      {!stage.fixedLayout ? (
        <button
          onClick={() => {
            const a = pick(true);
            setAssign(a);
            useEditor.getState().reset([]);
            setMapKey((k) => k + 1);
          }}
          className="chip3d h-12 rounded-xl px-3 text-base font-bold"
        >
          🔀 다른 맵
        </button>
      ) : null}
      {soundBtn}
    </div>
  );

  return (
    <>
      <GameBoard
        key={`${assign.layoutId}-${assign.variant}-${mapKey}`}
        placed={placed}
        theme={theme}
        allowedBlocks={stage.allowedBlocks}
        maxNesting={stage.maxNesting}
        header={header}
        onRunEnd={onRunEnd}
        hint={hint}
        showHintButton={fails >= 3}
        tutorial={stage.tutorial && !best ? stage.tutorial : undefined}
      />
      {clear ? (
        <ResultModal
          clear={clear}
          last={stage.stage === 5}
          onNext={() => {
            setClear(null);
            onNext(stage);
          }}
          onRetry={() => setClear(null)}
          onOther={
            stage.fixedLayout
              ? undefined
              : () => {
                  setClear(null);
                  const a = pick(true);
                  setAssign(a);
                  useEditor.getState().reset([]);
                  setMapKey((k) => k + 1);
                }
          }
        />
      ) : null}
    </>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  const colors = ["#f4b9cb", "#f8e2a4", "#a9dcc9", "#a9cdf0", "#cbbcf0"];
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((i) => (
        <span
          key={i}
          className="confetti absolute top-0 block h-3 w-2 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 6) * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function ResultModal({
  clear,
  last,
  onNext,
  onRetry,
  onOther,
}: {
  clear: Clear;
  last: boolean;
  onNext: () => void;
  onRetry: () => void;
  onOther?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <Confetti />
      <div className="pop relative z-50 w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
        <h2 id="result-title" className="text-3xl font-black tracking-tight">
          도착 성공!
        </h2>
        <div className="my-3 flex justify-center">
          <Stars n={clear.stars} size={56} />
        </div>
        <p className="text-xl">
          블록 <b className="text-2xl">{clear.blocks}</b>개 / 목표 <b className="text-2xl">{clear.target}</b>개
        </p>
        {clear.stars < 3 ? <p className="mt-1 text-base text-slate-600">블록을 {clear.blocks - clear.target}개 줄이면 ★3개!</p> : null}
        {clear.genius ? <p className="mt-2 rounded-xl bg-[#f6e3f0] p-2 text-lg font-black">천재 프로그래머!</p> : null}
        {clear.concept ? <p className="mt-2 rounded-xl bg-[#e1f3ee] p-2 text-lg font-black">조건 블록으로 성공!</p> : null}
        <div className="mt-5 grid gap-2">
          <button onClick={onNext} className="blk3d h-16 rounded-2xl bg-[#9fdcc3] text-2xl font-black" style={{ ["--blk-edge" as string]: "#6fbb9c" }} data-testid="next-stage">
            {last ? "챕터 완료 →" : "다음 단계 →"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onRetry} className="h-14 rounded-2xl bg-slate-100 text-lg font-bold">
              ↺ 다시 하기
            </button>
            {onOther ? (
              <button onClick={onOther} className="h-14 rounded-2xl bg-slate-100 text-lg font-bold">
                🔀 다른 맵
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChapterDone({
  chapter,
  progress,
  onRegister,
  onNextChapter,
  onHome,
}: {
  chapter: number;
  progress: Progress;
  onRegister: () => void;
  onNextChapter: () => void;
  onHome: () => void;
}) {
  const stages = STAGES.filter((s) => s.chapter === chapter);
  const stars = stages.reduce((n, s) => n + (progress.best[s.id]?.stars ?? 0), 0);
  const c = CHAPTERS[chapter - 1];
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Confetti />
      <div className="pop w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-xl" data-testid="chapter-done">
        <ChapterDiorama chapter={chapter as 1 | 2 | 3} />
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          {chapter}장 「{c.title}」 완료!
        </h1>
        <p className="mt-3 text-2xl">
          모은 별 <b className="text-[#c4895a]">★ {stars}</b> / 15
        </p>
        <div className="mt-6 grid gap-2">
          {DEMO ? null : (
            <button onClick={onRegister} className="blk3d h-16 rounded-2xl bg-[#f8e2a4] text-2xl font-black" style={{ ["--blk-edge" as string]: "#dcbd6c" }}>
              🏆 랭킹에 등록하기
            </button>
          )}
          {chapter < 3 ? (
            <button onClick={onNextChapter} className="blk3d h-16 rounded-2xl bg-[#9fdcc3] text-2xl font-black" style={{ ["--blk-edge" as string]: "#6fbb9c" }}>
              다음 챕터 →
            </button>
          ) : null}
          <button onClick={onHome} className="h-14 rounded-2xl bg-slate-100 text-lg font-bold">
            챕터 고르기
          </button>
        </div>
      </div>
    </div>
  );
}
