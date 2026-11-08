/* 개인 모드 맵 배정 (5절 배정 규칙). 순수 함수. */
import { VARIANTS } from "@/engine/map";
import type { Variant } from "@/engine/types";
import { THEME_IDS } from "@/content/themeIds";
import { candidatesFor, StageSpec } from "@/content/stages";

export interface PlayedCombo {
  layoutId: string;
  variant: Variant;
  themeId: string;
  at: number;
}

export function assignForStage(
  stage: StageSpec,
  history: PlayedCombo[],
  lastThemeId: string | null,
  rng: () => number = Math.random,
  avoid?: { layoutId: string; variant: Variant },
): { layoutId: string; variant: Variant; themeId: string } {
  const pickOne = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  const themes = THEME_IDS.filter((t) => t !== lastThemeId);
  const themeId = pickOne(themes.length ? themes : [...THEME_IDS]);
  const cands = candidatesFor(stage);
  if (stage.fixedLayout) return { layoutId: stage.fixedLayout, variant: "orig", themeId };

  const playedLayouts = new Set(history.map((h) => h.layoutId));
  const playedCombos = new Set(history.map((h) => `${h.layoutId}|${h.variant}`));
  const notSame = (l: string, v: Variant) => !avoid || l !== avoid.layoutId || v !== avoid.variant;

  // 1. 아직 플레이하지 않은 레이아웃
  const fresh = cands.filter((l) => !playedLayouts.has(l.id) && (!avoid || l.id !== avoid.layoutId));
  if (fresh.length) return { layoutId: pickOne(fresh).id, variant: pickOne([...VARIANTS]), themeId };

  // 2. 플레이하지 않은 (레이아웃, 변형) 조합
  const combos = cands.flatMap((l) => VARIANTS.map((v) => ({ layoutId: l.id, variant: v })));
  const freshCombos = combos.filter((c) => !playedCombos.has(`${c.layoutId}|${c.variant}`) && notSame(c.layoutId, c.variant));
  if (freshCombos.length) return { ...pickOne(freshCombos), themeId };

  // 3. 가장 오래전에 플레이한 조합
  const lastAt = new Map<string, number>();
  for (const h of history) {
    const k = `${h.layoutId}|${h.variant}`;
    lastAt.set(k, Math.max(lastAt.get(k) ?? 0, h.at));
  }
  const sorted = combos
    .filter((c) => notSame(c.layoutId, c.variant))
    .sort((a, b) => (lastAt.get(`${a.layoutId}|${a.variant}`) ?? 0) - (lastAt.get(`${b.layoutId}|${b.variant}`) ?? 0));
  return { ...(sorted[0] ?? combos[0]), themeId };
}
