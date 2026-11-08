"use client";
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useState } from "react";
import { REPEAT_MAX, REPEAT_MIN } from "@/engine/types";
import { BLOCK_META, BlockIcon } from "./BlockIcon";
import { countE, EBlock, isEContainer, useEditor } from "./editorStore";

type Layout = "col" | "row";

export function ProgramEditor({
  layout,
  activeId,
  failId,
  emptyId,
  tutorialTarget,
}: {
  layout: Layout;
  activeId: string | null;
  failId: string | null;
  emptyId: string | null;
  tutorialTarget?: { kind: "count" | "select"; id: string } | null;
}) {
  const program = useEditor((s) => s.program);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const move = useEditor((s) => s.move);
  const locked = useEditor((s) => s.locked);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    const over = e.over?.id;
    if (!over || typeof over !== "string" || !over.startsWith("slot:")) return;
    const [, parent, index] = over.split(":");
    move(String(e.active.id), parent === "root" ? null : parent, Number(index));
  };

  const ctx: RenderCtx = { layout, activeId, failId, emptyId, selected, dragging, locked, tutorialTarget: tutorialTarget ?? null };

  return (
    <DndContext sensors={sensors} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
      <div
        data-testid="program"
        className={`panel3d relative min-h-[72px] rounded-2xl border-4 p-2 ${selected === null && !locked ? "border-[#f3c98b]" : "border-transparent"} ${
          layout === "row" ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto"
        } h-full`}
        onClick={(e) => {
          if (e.target === e.currentTarget) select(null);
        }}
      >
        {program.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-base text-slate-400">
            아래 블록을 눌러 명령을 넣어요
          </p>
        ) : null}
        <BlockList blocks={program} parent={null} ctx={ctx} />
      </div>
    </DndContext>
  );
}

interface RenderCtx {
  layout: Layout;
  activeId: string | null;
  failId: string | null;
  emptyId: string | null;
  selected: string | null;
  dragging: boolean;
  locked: boolean;
  tutorialTarget: { kind: "count" | "select"; id: string } | null;
}

function BlockList({ blocks, parent, ctx }: { blocks: EBlock[]; parent: string | null; ctx: RenderCtx }) {
  const select = useEditor((s) => s.select);
  const isRow = ctx.layout === "row";
  return (
    <div
      className={`flex ${isRow ? "flex-row items-stretch" : "flex-col"} gap-1`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          select(parent);
        }
      }}
    >
      <Slot parent={parent} index={0} ctx={ctx} />
      {blocks.map((b, i) => (
        <div key={b.id} className={`flex ${isRow ? "flex-row items-stretch" : "flex-col"} gap-1`}>
          <BlockView block={b} ctx={ctx} />
          <Slot parent={parent} index={i + 1} ctx={ctx} />
        </div>
      ))}
      {ctx.selected === parent && !ctx.locked ? (
        <div
          aria-hidden
          className={`flex items-center justify-center rounded-lg border-2 border-dashed border-[#f3c98b] text-sm font-bold text-[#c4895a] ${
            isRow ? "min-w-10 px-1" : "h-8"
          }`}
        >
          ＋
        </div>
      ) : null}
    </div>
  );
}

function Slot({ parent, index, ctx }: { parent: string | null; index: number; ctx: RenderCtx }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${parent ?? "root"}:${index}` });
  const isRow = ctx.layout === "row";
  if (!ctx.dragging) return <div ref={setNodeRef} className={isRow ? "w-0" : "h-0"} />;
  return (
    <div
      ref={setNodeRef}
      className={`rounded ${isOver ? "bg-[#f3c98b]" : "bg-[#f3c98b]/50"} ${isRow ? "w-4 self-stretch" : "h-4"}`}
    />
  );
}

function BlockView({ block, ctx }: { block: EBlock; ctx: RenderCtx }) {
  const remove = useEditor((s) => s.remove);
  const select = useEditor((s) => s.select);
  const countOpen = useEditor((s) => s.countOpen);
  const openCount = useEditor((s) => s.openCount);
  const setCount = useEditor((s) => s.setCount);
  const setColor = useEditor((s) => s.setColor);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: block.id, disabled: ctx.locked });
  const meta = BLOCK_META[block.t];
  const active = ctx.activeId === block.id;
  const failed = ctx.failId === block.id;
  const empty = ctx.emptyId === block.id;
  const isSel = ctx.selected === block.id;
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined;
  const ring = failed || empty ? "ring-4 ring-red-500" : active ? "ring-4 ring-yellow-300 scale-105" : "";
  const tut = (kind: "count" | "select") => ctx.tutorialTarget?.kind === kind && ctx.tutorialTarget.id === block.id;

  const header = (
    <div
      className={`blk3d flex min-h-14 items-center gap-1.5 rounded-xl px-2 text-[#3d3a5c] ${ring}`}
      style={{ background: meta.bg, ["--blk-edge" as string]: meta.border }}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${meta.label} 블록`}
      data-block={block.t}
      data-testid={`blk-${block.t}`}
      onClick={(e) => {
        e.stopPropagation();
        if (isEContainer(block)) select(isSel ? null : block.id);
      }}
    >
      <BlockIcon t={block.t} color={block.t === "ifColor" ? block.color : undefined} />
      <span className="whitespace-nowrap text-base font-bold">{meta.label}</span>
      {block.t === "repeat" ? (
        countOpen === block.id && !ctx.locked ? (
          <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <button
              className="h-14 w-14 rounded-lg bg-white/90 text-3xl font-black text-[#3d3a5c] disabled:opacity-40"
              onClick={() => setCount(block.id, block.n - 1)}
              disabled={block.n <= REPEAT_MIN}
              aria-label="횟수 줄이기"
            >
              −
            </button>
            <span className="w-8 text-center text-2xl font-black">{block.n}</span>
            <button
              className={`h-14 w-14 rounded-lg bg-white/90 text-3xl font-black text-[#3d3a5c] disabled:opacity-40 ${tut("count") ? "glow" : ""}`}
              onClick={() => setCount(block.id, block.n + 1)}
              disabled={block.n >= REPEAT_MAX}
              aria-label="횟수 늘리기"
              data-testid="count-plus"
            >
              ＋
            </button>
            <button className="h-12 rounded-lg px-2 text-sm font-bold underline" onClick={() => openCount(null)}>
              닫기
            </button>
          </span>
        ) : (
          <button
            className={`flex h-12 min-w-12 items-center justify-center rounded-lg bg-white text-2xl font-black text-[#3d3a5c] ${tut("count") ? "glow" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openCount(block.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`반복 ${block.n}번, 눌러서 바꾸기`}
            data-testid="count"
            disabled={ctx.locked}
          >
            {block.n}
          </button>
        )
      ) : null}
      {block.t === "ifColor" ? (
        <button
          className="h-12 rounded-lg bg-white/90 px-2 text-sm font-bold text-[#3d3a5c]"
          onClick={(e) => {
            e.stopPropagation();
            setColor(block.id, block.color === "red" ? "blue" : "red");
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={ctx.locked}
          aria-label="색 바꾸기"
        >
          {block.color === "red" ? "빨강▲" : "파랑●"}
        </button>
      ) : null}
      {!ctx.locked ? (
        <button
          className="ml-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/55 text-2xl font-black"
          aria-label={`${meta.label} 블록 지우기`}
          onClick={(e) => {
            e.stopPropagation();
            remove(block.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      ) : null}
    </div>
  );

  if (!isEContainer(block)) {
    return (
      <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70" : ""}>
        {header}
      </div>
    );
  }
  const isRow = ctx.layout === "row";
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: isSel ? "#f59e0b" : meta.bg }}
      className={`rounded-2xl border-4 bg-slate-50 p-1 ${isDragging ? "opacity-70" : ""} ${isRow ? "flex flex-row items-stretch gap-1" : ""} ${
        tut("select") ? "glow" : ""
      } ${isSel ? "shadow-[0_0_0_3px_#fde68a]" : ""}`}
      data-testid={`container-${block.t}`}
    >
      {header}
      <div className={`${isRow ? "flex items-stretch pl-1" : "pl-5 pt-1"} min-h-10`}>
        {block.body.length === 0 && !(isSel && !ctx.locked) ? (
          <div
            className={`flex items-center justify-center rounded-lg border-2 border-dashed px-2 text-sm ${empty ? "border-red-500 text-red-600" : "border-slate-300 text-slate-400"} ${
              isRow ? "min-w-24" : "h-12"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              select(block.id);
            }}
          >
            {empty ? "안에 블록을 넣어 주세요" : "여기에 넣기"}
          </div>
        ) : null}
        <BlockList blocks={block.body} parent={block.id} ctx={ctx} />
      </div>
    </div>
  );
}

export function ProgramCount() {
  const program = useEditor((s) => s.program);
  return <>{countE(program)}</>;
}
