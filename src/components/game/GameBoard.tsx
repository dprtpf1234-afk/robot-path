"use client";
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlacedLayout } from "@/engine/map";
import { toGameMap } from "@/engine/map";
import { checkProgram, countBlocks } from "@/engine/program";
import type { BlockType, Color, Program, RunResult } from "@/engine/types";
import type { Theme } from "@/content/themes";
import type { TutorialStep } from "@/content/stages";
import { sfx } from "@/lib/sound";
import { BLOCK_META, BlockIcon } from "./BlockIcon";
import { countE, EBlock, findBlock, idAtPath, toProgram, useEditor } from "./editorStore";
import { MapView } from "./MapView";
import { ProgramEditor } from "./ProgramEditor";
import { StaticProgram } from "./StaticProgram";
import { usePlayback } from "./usePlayback";

export function useLandscape() {
  const [land, setLand] = useState(true);
  useEffect(() => {
    const f = () => setLand(window.innerWidth >= 700 && window.innerWidth > window.innerHeight * 1.05);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return land;
}

const OUTCOME_TEXT: Record<string, string> = {
  success: "도착! 잘했어요!",
  crash: "앗, 부딪혔어요! 빨간 블록을 고쳐 볼까?",
  tired: "로봇이 지쳤어요. 블록을 줄여 볼까?",
  notArrived: "조금만 더! 다시 해볼까?",
};

export interface GameBoardProps {
  placed: PlacedLayout;
  theme: Theme;
  allowedBlocks: BlockType[];
  maxNesting: number;
  header?: ReactNode;
  /** 실행 버튼 옆에 둘 추가 버튼 */
  extra?: ReactNode;
  canRun?: boolean;
  /** 실행을 누른 순간 (토너먼트: 서버 제출) */
  onRunStart?: (program: Program) => void;
  /** 애니메이션이 끝난 뒤 */
  onRunEnd?: (r: RunResult, program: Program) => void;
  onProgramChange?: (program: Program) => void;
  hint?: Program | null;
  showHintButton?: boolean;
  tutorial?: TutorialStep[];
  /** 로봇 결과 문장을 바꾸고 싶을 때 */
  outcomeText?: (r: RunResult) => string | null;
}

export function GameBoard(props: GameBoardProps) {
  const { placed, theme, allowedBlocks, maxNesting } = props;
  const map = useMemo(() => toGameMap(placed), [placed]);
  const pb = usePlayback(map);
  const land = useLandscape();
  const program = useEditor((s) => s.program);
  const version = useEditor((s) => s.version);
  const locked = useEditor((s) => s.locked);
  const message = useEditor((s) => s.message);
  const selected = useEditor((s) => s.selected);
  const undo = useEditor((s) => s.undo);
  const ed = useEditor.getState;
  const [speed, setSpeed] = useState(1);
  const [feedback, setFeedback] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [emptyId, setEmptyId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EBlock[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [idle, setIdle] = useState(false);
  const [tutIndex, setTutIndex] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const lastRunVersion = useRef(-1);

  useEffect(() => {
    ed().setRules(maxNesting);
  }, [maxNesting, ed]);

  // 편집이 바뀌면 로봇을 처음 자리로 + 관전 채널 알림
  const onChange = props.onProgramChange;
  useEffect(() => {
    if (locked) return;
    if (lastRunVersion.current !== -1 && lastRunVersion.current !== version) {
      pb.reset();
      setFeedback(null);
      lastRunVersion.current = -1;
    }
    setEmptyId(null);
    onChange?.(toProgram(ed().program));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // 60초 동안 동작이 없으면 다음에 누를 곳을 빛나게
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const poke = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 60_000);
    };
    poke();
    window.addEventListener("pointerdown", poke);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", poke);
    };
  }, []);

  const tutorial = props.tutorial;
  const tutStep = tutorial && tutIndex < tutorial.length ? tutorial[tutIndex] : null;
  // 튜토리얼 진행: 기대한 동작이 일어났는지 상태로 판정
  useEffect(() => {
    if (!tutStep) return;
    const tg = tutStep.target;
    if (tg.kind === "count") {
      const id = idAtPath(program, tg.path);
      const b = id ? findBlock(program, id) : null;
      if (b && b.t === "repeat" && b.n === tg.n) setTutIndex((i) => i + 1);
    } else if (tg.kind === "select") {
      const id = idAtPath(program, tg.path);
      if (id && selected === id) setTutIndex((i) => i + 1);
    }
  }, [program, selected, tutStep]);

  const tapPalette = (t: BlockType, color?: Color) => {
    if (locked) return;
    sfx.tap();
    const ok = ed().add(t, color);
    if (ok && tutStep?.target.kind === "palette" && tutStep.target.block === t) setTutIndex((i) => i + 1);
  };

  const run = useCallback(async () => {
    const st = ed();
    if (st.locked || props.canRun === false) return;
    const prog = toProgram(st.program);
    if (prog.length === 0) {
      setFeedback({ text: "블록을 먼저 넣어 주세요", tone: "info" });
      return;
    }
    const err = checkProgram(prog, { allowedBlocks, maxNesting });
    if (err) {
      if (err.code === "emptyContainer") setEmptyId(idAtPath(st.program, err.path));
      setFeedback({ text: err.message, tone: "bad" });
      return;
    }
    if (tutStep?.target.kind === "run") setTutIndex((i) => i + 1);
    const snap = st.program;
    setSnapshot(snap);
    st.setLocked(true);
    setFeedback(null);
    props.onRunStart?.(prog);
    const r = await pb.play(prog, speed);
    useEditor.getState().setLocked(false);
    lastRunVersion.current = useEditor.getState().version;
    const custom = props.outcomeText?.(r);
    setFeedback({ text: custom ?? OUTCOME_TEXT[r.outcome], tone: r.outcome === "success" ? "good" : "bad" });
    props.onRunEnd?.(r, prog);
  }, [allowedBlocks, maxNesting, pb, props, speed, tutStep, ed]);

  const activeId = snapshot && pb.activePath ? idAtPath(snapshot, pb.activePath) : null;
  const failId = snapshot && pb.failPath ? idAtPath(snapshot, pb.failPath) : null;
  const total = countE(program);

  const palette: { t: BlockType; color?: Color; key: string }[] = [];
  for (const t of allowedBlocks) {
    if (t === "ifColor") {
      palette.push({ t, color: "red", key: "ifColor-red" }, { t, color: "blue", key: "ifColor-blue" });
    } else palette.push({ t, key: t });
  }
  const tutTarget = tutStep?.target;
  const isTut = (key: string) => tutTarget?.kind === "palette" && (tutTarget.block === key || key.startsWith(tutTarget.block + "-"));
  const idleTarget = idle && !tutStep ? (program.length === 0 ? palette[0]?.key : "run") : null;

  const tutorialEditorTarget =
    tutTarget && (tutTarget.kind === "count" || tutTarget.kind === "select")
      ? { kind: tutTarget.kind, id: idAtPath(program, tutTarget.path) ?? "" }
      : null;

  const paletteEl = (
    <div className={`grid gap-2 ${land ? "grid-cols-2" : "auto-cols-[minmax(76px,1fr)] grid-flow-col overflow-x-auto pb-1"}`} data-testid="palette">
      {palette.map((p) => {
        const meta = BLOCK_META[p.t];
        const label = p.t === "ifColor" ? (p.color === "red" ? "빨강이면" : "파랑이면") : meta.label;
        return (
          <button
            key={p.key}
            data-testid={`pal-${p.key}`}
            data-tut={isTut(p.key) ? "target" : undefined}
            onClick={() => tapPalette(p.t, p.color)}
            disabled={locked}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1 text-white shadow-md active:translate-y-0.5 disabled:opacity-50 ${
              isTut(p.key) || idleTarget === p.key ? "glow" : ""
            }`}
            style={{ background: meta.bg, borderBottom: `5px solid ${meta.border}` }}
            aria-label={`${label} 블록 추가`}
          >
            <BlockIcon t={p.t} color={p.color} size={30} />
            <span className="text-sm font-bold leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => ed().doUndo()}
        disabled={locked || !undo}
        className="h-14 min-w-14 rounded-xl bg-white px-3 text-base font-bold shadow disabled:opacity-40"
        aria-label="되돌리기"
      >
        ↶
      </button>
      <button
        onClick={() => ed().clear()}
        disabled={locked || program.length === 0}
        className="h-14 rounded-xl bg-white px-3 text-base font-bold whitespace-nowrap shadow disabled:opacity-40"
      >
        {land ? "모두 지우기" : "지우기"}
      </button>
      <button
        onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
        className={`h-14 min-w-14 rounded-xl px-3 text-base font-black shadow ${speed === 2 ? "bg-amber-400" : "bg-white"}`}
        aria-label={`속도 ${speed}배`}
        aria-pressed={speed === 2}
      >
        {speed}×
      </button>
      {props.showHintButton && props.hint ? (
        <button onClick={() => setShowHint(true)} className="h-14 rounded-xl bg-yellow-300 px-3 text-base font-bold shadow">
          💡 힌트
        </button>
      ) : null}
      {props.extra}
    </div>
  );

  const runBtn = (
    <button
      onClick={run}
      disabled={locked || props.canRun === false}
      data-testid="run"
      data-tut={tutTarget?.kind === "run" ? "target" : undefined}
      className={`flex h-16 shrink-0 min-w-28 items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 text-2xl font-black text-white shadow-lg active:translate-y-0.5 disabled:bg-slate-400 ${
        tutTarget?.kind === "run" || idleTarget === "run" ? "glow" : ""
      }`}
      style={{ borderBottom: "6px solid #15803d" }}
    >
      ▶ 실행
    </button>
  );

  const fbText = message ?? feedback?.text ?? null;
  const fbTone = message ? "bad" : (feedback?.tone ?? "info");
  const feedbackEl = (
    <div aria-live="polite" className="min-h-8 text-center text-lg font-bold">
      {fbText ? (
        <span className={fbTone === "good" ? "text-green-700" : fbTone === "bad" ? "text-rose-700" : "text-slate-700"}>{fbText}</span>
      ) : (
        <span className="text-slate-500">블록 {total}개</span>
      )}
    </div>
  );

  const mapEl = (
    <MapView placed={placed} theme={theme} robot={pb.robot} anim={pb.anim} stepMs={pb.stepMs} trail={pb.trail} label={`${theme.name} 맵`} />
  );

  return (
    <div ref={boardRef} className="relative flex h-full min-h-0 flex-col">
      {props.header}
      {tutStep ? (
        <div className="pop mx-auto my-1 rounded-full bg-amber-100 px-5 py-2 text-center text-xl font-black text-amber-900 shadow" data-testid="tutorial-text">
          {tutStep.text}
        </div>
      ) : null}
      {land ? (
        <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-3 p-3">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex min-h-0 flex-1 items-center justify-center">{mapEl}</div>
            {feedbackEl}
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1">
              <ProgramEditor layout="col" activeId={activeId} failId={failId} emptyId={emptyId} tutorialTarget={tutorialEditorTarget} />
            </div>
            {paletteEl}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {controls}
              {runBtn}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-2 pt-1">
          <div className="flex min-h-0 flex-1 items-center justify-center">{mapEl}</div>
          {feedbackEl}
          <div className="h-[132px] shrink-0">
            <ProgramEditor layout="row" activeId={activeId} failId={failId} emptyId={emptyId} tutorialTarget={tutorialEditorTarget} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 overflow-x-auto">{controls}</div>
            {runBtn}
          </div>
          {paletteEl}
        </div>
      )}
      {tutStep ? <Finger rootRef={boardRef} dep={`${tutIndex}-${version}-${land}`} /> : null}
      {showHint && props.hint ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowHint(false)}>
          <div className="pop w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-2xl font-black">💡 힌트</h2>
            <p className="mb-3 text-base text-slate-600">처음은 이렇게 시작해 봐요</p>
            <StaticProgram program={props.hint.slice(0, 2)} />
            {countBlocks(props.hint) > countBlocks(props.hint.slice(0, 2)) ? <p className="mt-2 text-center text-2xl text-slate-400">…</p> : null}
            <button className="mt-4 h-14 w-full rounded-2xl bg-indigo-600 text-xl font-bold text-white" onClick={() => setShowHint(false)}>
              알겠어요
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 튜토리얼 손가락: data-tut="target" 요소를 가리킨다 */
function Finger({ rootRef, dep }: { rootRef: React.RefObject<HTMLDivElement | null>; dep: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const update = () => {
      const root = rootRef.current;
      const el = document.querySelector<HTMLElement>('[data-tut="target"]');
      if (!root || !el) return setPos(null);
      const r = el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      setPos({ x: r.left - rr.left + r.width * 0.6, y: r.top - rr.top + r.height * 0.55 });
    };
    const loop = () => {
      update();
      raf = window.setTimeout(loop, 400) as unknown as number;
    };
    loop();
    return () => clearTimeout(raf);
  }, [rootRef, dep]);
  if (!pos) return null;
  return (
    <div className="pointer-events-none absolute z-30" style={{ left: pos.x, top: pos.y }} aria-hidden>
      <svg className="finger" width="54" height="64" viewBox="0 0 54 64">
        <path
          d="M18 4 Q24 0 28 6 L28 26 L34 25 Q40 25 41 30 L46 31 Q52 33 51 40 L49 52 Q47 62 36 62 L24 62 Q16 62 12 54 L4 40 Q2 34 8 33 Q12 33 15 38 L18 42 Z"
          fill="#fde68a"
          stroke="#78350f"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
