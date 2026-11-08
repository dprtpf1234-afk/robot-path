"use client";
import { create } from "zustand";
import type { Block, BlockType, Color, Program } from "@/engine/types";
import { MAX_BLOCKS, REPEAT_MAX, REPEAT_MIN } from "@/engine/types";

/** 화면용 블록: 엔진 블록 + id */
export type EBlock =
  | { id: string; t: "forward" | "left" | "right" }
  | { id: string; t: "repeat"; n: number; body: EBlock[] }
  | { id: string; t: "ifWall"; body: EBlock[] }
  | { id: string; t: "ifColor"; color: Color; body: EBlock[] }
  | { id: string; t: "untilGoal"; body: EBlock[] };

type EContainer = Extract<EBlock, { body: EBlock[] }>;

let seq = 0;
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export const isEContainer = (b: EBlock): b is EContainer => "body" in b;

export function toProgram(bs: EBlock[]): Program {
  return bs.map((b): Block => {
    switch (b.t) {
      case "forward":
      case "left":
      case "right":
        return { t: b.t };
      case "repeat":
        return { t: "repeat", n: b.n, body: toProgram(b.body) };
      case "ifWall":
        return { t: "ifWall", body: toProgram(b.body) };
      case "ifColor":
        return { t: "ifColor", color: b.color, body: toProgram(b.body) };
      case "untilGoal":
        return { t: "untilGoal", body: toProgram(b.body) };
    }
  });
}

export function fromProgram(p: Program): EBlock[] {
  return p.map((b): EBlock => {
    const id = newBlockId();
    switch (b.t) {
      case "forward":
      case "left":
      case "right":
        return { id, t: b.t };
      case "repeat":
        return { id, t: "repeat", n: b.n, body: fromProgram(b.body) };
      case "ifWall":
        return { id, t: "ifWall", body: fromProgram(b.body) };
      case "ifColor":
        return { id, t: "ifColor", color: b.color, body: fromProgram(b.body) };
      case "untilGoal":
        return { id, t: "untilGoal", body: fromProgram(b.body) };
    }
  });
}

export function makeBlock(t: BlockType, color: Color = "red"): EBlock {
  const id = newBlockId();
  switch (t) {
    case "repeat":
      return { id, t, n: 2, body: [] };
    case "ifWall":
    case "untilGoal":
      return { id, t, body: [] };
    case "ifColor":
      return { id, t, color, body: [] };
    default:
      return { id, t };
  }
}

export function countE(bs: EBlock[]): number {
  return bs.reduce((n, b) => n + 1 + (isEContainer(b) ? countE(b.body) : 0), 0);
}

function depthOf(bs: EBlock[]): number {
  return bs.reduce((d, b) => (isEContainer(b) ? Math.max(d, 1 + depthOf(b.body)) : d), 0);
}

/** id 블록까지의 그릇 깊이 (최상위 그릇 = 1). 없으면 -1 */
export function containerDepth(bs: EBlock[], id: string, d = 1): number {
  for (const b of bs) {
    if (b.id === id) return d;
    if (isEContainer(b)) {
      const r = containerDepth(b.body, id, d + 1);
      if (r > 0) return r;
    }
  }
  return -1;
}

export function findBlock(bs: EBlock[], id: string): EBlock | null {
  for (const b of bs) {
    if (b.id === id) return b;
    if (isEContainer(b)) {
      const r = findBlock(b.body, id);
      if (r) return r;
    }
  }
  return null;
}

/** 경로(인덱스 목록) → 블록 id */
export function idAtPath(bs: EBlock[], path: number[]): string | null {
  let cur: EBlock[] = bs;
  let b: EBlock | undefined;
  for (const i of path) {
    b = cur[i];
    if (!b) return null;
    cur = isEContainer(b) ? b.body : [];
  }
  return b?.id ?? null;
}

function mapTree(bs: EBlock[], f: (b: EBlock) => EBlock | null): EBlock[] {
  const out: EBlock[] = [];
  for (const b of bs) {
    const r = f(b);
    if (!r) continue;
    out.push(isEContainer(r) ? ({ ...r, body: mapTree(r.body, f) } as EBlock) : r);
  }
  return out;
}

function insertInto(bs: EBlock[], parentId: string | null, index: number, block: EBlock): EBlock[] {
  if (parentId === null) {
    const c = bs.slice();
    c.splice(Math.max(0, Math.min(index, c.length)), 0, block);
    return c;
  }
  return bs.map((b) => {
    if (!isEContainer(b)) return b;
    if (b.id === parentId) {
      const body = b.body.slice();
      body.splice(Math.max(0, Math.min(index, body.length)), 0, block);
      return { ...b, body } as EBlock;
    }
    return { ...b, body: insertInto(b.body, parentId, index, block) } as EBlock;
  });
}

function contains(b: EBlock, id: string): boolean {
  return b.id === id || (isEContainer(b) && b.body.some((c) => contains(c, id)));
}

/** 부모 그릇 id와 위치 */
export function locate(bs: EBlock[], id: string, parent: string | null = null): { parent: string | null; index: number } | null {
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (b.id === id) return { parent, index: i };
    if (isEContainer(b)) {
      const r = locate(b.body, id, b.id);
      if (r) return r;
    }
  }
  return null;
}

interface EditorState {
  program: EBlock[];
  selected: string | null; // 선택된 그릇 id (null = 맨 바깥)
  countOpen: string | null; // − / + 가 열린 반복 블록
  undo: EBlock[] | null;
  locked: boolean;
  maxNesting: number;
  message: string | null;
  version: number;
  setRules: (maxNesting: number) => void;
  reset: (program?: EBlock[]) => void;
  add: (t: BlockType, color?: Color) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  doUndo: () => void;
  select: (id: string | null) => void;
  openCount: (id: string | null) => void;
  setCount: (id: string, n: number) => void;
  setColor: (id: string, c: Color) => void;
  move: (id: string, parent: string | null, index: number) => boolean;
  setLocked: (v: boolean) => void;
  flash: (m: string | null) => void;
}

export const useEditor = create<EditorState>((set, get) => {
  const commit = (program: EBlock[], extra: Partial<EditorState> = {}) =>
    set((s) => ({ undo: s.program, program, version: s.version + 1, message: null, ...extra }));
  return {
    program: [],
    selected: null,
    countOpen: null,
    undo: null,
    locked: false,
    maxNesting: 0,
    message: null,
    version: 0,
    setRules: (maxNesting) => set({ maxNesting }),
    reset: (program = []) => set((s) => ({ program, selected: null, countOpen: null, undo: null, message: null, version: s.version + 1 })),
    add: (t, color) => {
      const s = get();
      if (s.locked) return false;
      if (countE(s.program) >= MAX_BLOCKS) {
        set({ message: `블록은 ${MAX_BLOCKS}개까지 놓을 수 있어요` });
        return false;
      }
      const block = makeBlock(t, color);
      const parent = s.selected && findBlock(s.program, s.selected) ? s.selected : null;
      const parentDepth = parent ? containerDepth(s.program, parent) : 0;
      if (isEContainer(block) && parentDepth + 1 > s.maxNesting) {
        set({ message: s.maxNesting === 0 ? "이 단계에서는 그릇 블록을 쓸 수 없어요" : "그릇 안에 그릇을 더 넣을 수 없어요" });
        return false;
      }
      const pb = parent ? (findBlock(s.program, parent) as EContainer) : null;
      const index = pb ? pb.body.length : s.program.length;
      commit(insertInto(s.program, parent, index, block), { selected: isEContainer(block) ? block.id : parent, countOpen: null });
      return true;
    },
    remove: (id) => {
      const s = get();
      if (s.locked) return;
      const target = findBlock(s.program, id);
      const sel = s.selected && target && contains(target, s.selected) ? locate(s.program, id)?.parent ?? null : s.selected;
      commit(mapTree(s.program, (b) => (b.id === id ? null : b)), { selected: sel, countOpen: null });
    },
    clear: () => {
      const s = get();
      if (s.locked || s.program.length === 0) return;
      commit([], { selected: null, countOpen: null });
    },
    doUndo: () => {
      const s = get();
      if (s.locked || !s.undo) return;
      set((st) => ({ program: s.undo!, undo: null, selected: null, countOpen: null, version: st.version + 1, message: null }));
    },
    select: (id) => set({ selected: id, countOpen: null }),
    openCount: (id) => set({ countOpen: id }),
    setCount: (id, n) => {
      const s = get();
      if (s.locked) return;
      const v = Math.max(REPEAT_MIN, Math.min(REPEAT_MAX, n));
      commit(mapTree(s.program, (b) => (b.id === id && b.t === "repeat" ? { ...b, n: v } : b)), { countOpen: id, selected: s.selected });
    },
    setColor: (id, c) => {
      const s = get();
      if (s.locked) return;
      commit(mapTree(s.program, (b) => (b.id === id && b.t === "ifColor" ? { ...b, color: c } : b)), { selected: s.selected });
    },
    move: (id, parent, index) => {
      const s = get();
      if (s.locked) return false;
      const block = findBlock(s.program, id);
      if (!block) return false;
      if (parent && contains(block, parent)) return false;
      const parentDepth = parent ? containerDepth(s.program, parent) : 0;
      const blockDepth = isEContainer(block) ? 1 + depthOf(block.body) : 0;
      if (parentDepth + blockDepth > s.maxNesting) {
        set({ message: "그릇 안에 그릇을 더 넣을 수 없어요" });
        return false;
      }
      const from = locate(s.program, id)!;
      let idx = index;
      if (from.parent === parent && from.index < index) idx -= 1;
      const without = mapTree(s.program, (b) => (b.id === id ? null : b));
      commit(insertInto(without, parent, idx, block), { selected: s.selected });
      return true;
    },
    setLocked: (v) => set({ locked: v, countOpen: null }),
    flash: (m) => set({ message: m }),
  };
});
