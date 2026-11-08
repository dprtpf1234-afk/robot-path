"use client";
import type { Block, Program } from "@/engine/types";
import { BLOCK_META, BlockIcon } from "./BlockIcon";

/** 읽기 전용 블록 목록 (힌트·관전용). activePath = 지금 실행 중인 블록 위치 */
export function StaticProgram({
  program,
  activePath,
  failPath,
  size = "md",
}: {
  program: Program;
  activePath?: number[] | null;
  failPath?: number[] | null;
  size?: "sm" | "md";
}) {
  return <List blocks={program} prefix={[]} activePath={activePath ?? null} failPath={failPath ?? null} size={size} />;
}

const same = (a: number[] | null, b: number[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

function List({
  blocks,
  prefix,
  activePath,
  failPath,
  size,
}: {
  blocks: Block[];
  prefix: number[];
  activePath: number[] | null;
  failPath: number[] | null;
  size: "sm" | "md";
}) {
  return (
    <div className="flex flex-col gap-1">
      {blocks.map((b, i) => {
        const path = [...prefix, i];
        const meta = BLOCK_META[b.t];
        const ring = same(failPath, path) ? "ring-4 ring-red-500" : same(activePath, path) ? "ring-4 ring-yellow-300" : "";
        const h = size === "sm" ? "min-h-9 text-sm" : "min-h-12 text-base";
        const head = (
          <div className={`flex items-center gap-1 rounded-lg px-2 font-bold text-white ${h} ${ring}`} style={{ background: meta.bg }}>
            <BlockIcon t={b.t} color={b.t === "ifColor" ? b.color : undefined} size={size === "sm" ? 22 : 28} />
            <span>{meta.label}</span>
            {b.t === "repeat" ? <span className="ml-1 rounded bg-white px-1.5 font-black text-orange-800">{b.n}</span> : null}
            {b.t === "ifColor" ? <span className="ml-1 rounded bg-white/90 px-1 text-xs text-emerald-900">{b.color === "red" ? "빨강▲" : "파랑●"}</span> : null}
          </div>
        );
        if (!("body" in b)) return <div key={i}>{head}</div>;
        return (
          <div key={i} className="rounded-xl border-2 p-0.5" style={{ borderColor: meta.bg }}>
            {head}
            <div className="pl-4 pt-1">
              <List blocks={b.body} prefix={path} activePath={activePath} failPath={failPath} size={size} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
