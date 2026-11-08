import { VARIANTS } from "@/engine/map";
import type { LayoutJson, Variant } from "@/engine/types";
import type { PlayGrade } from "@/content/grades";
import { THEME_IDS } from "@/content/themeIds";

export interface MapUse {
  layoutId: string;
  variant: Variant;
  at: number;
}

export interface AssignInput {
  grade: PlayGrade;
  layouts: LayoutJson[]; // 전체 레이아웃 (등급으로 거른다)
  used: MapUse[]; // 이 대회에서 쓴 (레이아웃, 변형)
  busy: { layoutId: string; variant: Variant }[]; // 지금 동시에 진행 중인 다른 경기
  prevLayoutId: string | null; // 같은 경기의 직전 시도
  prevThemeId: string | null;
  rng: () => number;
}

/**
 * 5절 토너먼트 배정 규칙.
 * - 동시 진행 경기끼리 같은 레이아웃 금지, 직전 시도와 다른 레이아웃.
 * - 레이아웃이 모자라면 모자란 만큼만 다른 변형을 허용 (같은 (레이아웃, 변형)은 절대 겹치지 않게).
 * - 미사용 조합 우선, 그중 아직 안 쓴 레이아웃 먼저. 소진되면 사용 횟수 적고 오래전에 쓴 조합.
 */
export function assignMap(inp: AssignInput): { layoutId: string; variant: Variant; themeId: string; contentVersion: number } {
  const pool = inp.layouts.filter((l) => l.grade === inp.grade);
  if (pool.length === 0) throw new Error(`no layouts for ${inp.grade}`);
  const busyLayouts = new Set(inp.busy.map((b) => b.layoutId));
  const busyCombos = new Set(inp.busy.map((b) => `${b.layoutId}|${b.variant}`));

  let layouts = pool.filter((l) => !busyLayouts.has(l.id) && l.id !== inp.prevLayoutId);
  let allowSharedLayout = false;
  if (layouts.length === 0) {
    layouts = pool.filter((l) => l.id !== inp.prevLayoutId);
    allowSharedLayout = true;
  }
  if (layouts.length === 0) {
    layouts = pool;
    allowSharedLayout = true;
  }

  const combos: { layout: LayoutJson; variant: Variant }[] = [];
  for (const l of layouts)
    for (const v of VARIANTS) if (!allowSharedLayout || !busyCombos.has(`${l.id}|${v}`)) combos.push({ layout: l, variant: v });
  const fallback = combos.length ? combos : pool.flatMap((l) => VARIANTS.map((v) => ({ layout: l, variant: v })));

  const comboUses = new Map<string, { n: number; last: number }>();
  const layoutUses = new Map<string, number>();
  for (const u of inp.used) {
    const k = `${u.layoutId}|${u.variant}`;
    const c = comboUses.get(k) ?? { n: 0, last: 0 };
    comboUses.set(k, { n: c.n + 1, last: Math.max(c.last, u.at) });
    layoutUses.set(u.layoutId, (layoutUses.get(u.layoutId) ?? 0) + 1);
  }
  // 정렬 키: (조합 사용 횟수, 레이아웃 사용 횟수, 마지막 사용 시각, 무작위)
  const scored = fallback.map((c) => {
    const u = comboUses.get(`${c.layout.id}|${c.variant}`);
    return { ...c, k1: u?.n ?? 0, k2: layoutUses.get(c.layout.id) ?? 0, k3: u?.last ?? 0, k4: inp.rng() };
  });
  scored.sort((a, b) => a.k1 - b.k1 || a.k2 - b.k2 || a.k3 - b.k3 || a.k4 - b.k4);
  const choice = scored[0];
  const themes = THEME_IDS.filter((t) => t !== inp.prevThemeId);
  const themeId = themes[Math.floor(inp.rng() * themes.length)];
  return { layoutId: choice.layout.id, variant: choice.variant, themeId, contentVersion: choice.layout.contentVersion };
}
