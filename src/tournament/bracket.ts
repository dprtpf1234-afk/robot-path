import { GRADES, PlayGrade } from "@/content/grades";
import type { Preset } from "./types";

export const PRESETS: Record<Preset, { label: string; min: PlayGrade; max: PlayGrade; use: string }> = {
  low: { label: "저학년", min: "D1", max: "D3", use: "1~3학년 대회" },
  all: { label: "전체", min: "D2", max: "D5", use: "학년 섞인 대회" },
  high: { label: "고학년", min: "D3", max: "D6", use: "4~6학년 대회" },
};

/** 인원을 올림(인원/2)으로 줄여 1명이 될 때까지의 횟수 */
export function roundsFor(n: number): number {
  let r = 0;
  while (n > 1) {
    n = Math.ceil(n / 2);
    r++;
  }
  return r;
}

/** 7절 라운드 등급 계산. T = 시작 인원 기준, survivors = 지금 생존자 수 */
export function gradeForRound(preset: Preset, T: number, survivors: number): PlayGrade {
  const lo = GRADES.indexOf(PRESETS[preset].min);
  const hi = GRADES.indexOf(PRESETS[preset].max);
  const k = roundsFor(survivors);
  if (k <= 1 || T <= 1) return GRADES[hi];
  const r = Math.max(1, T - k + 1);
  const idx = lo + Math.round(((r - 1) * (hi - lo)) / (T - 1));
  return GRADES[Math.min(hi, Math.max(lo, idx))];
}

export function easierGrade(g: PlayGrade): PlayGrade {
  const i = GRADES.indexOf(g);
  return GRADES[Math.max(0, i - 1)];
}

export function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ByeInfo {
  id: string;
  hadBye: boolean;
  lastByeRound: number | null;
}

/**
 * 생존자를 무작위로 짝짓는다. 홀수면 1명 부전승:
 * 부전승을 받은 적 없는 선수 중에서, 모두 받았으면 직전 라운드 부전승자만 빼고 뽑는다.
 */
export function pairRound(
  survivors: ByeInfo[],
  round: number,
  rng: () => number,
): { pairs: [string, string][]; bye: string | null } {
  let pool = survivors.slice();
  let bye: string | null = null;
  if (pool.length % 2 === 1) {
    let cands = pool.filter((p) => !p.hadBye);
    if (cands.length === 0) cands = pool.filter((p) => p.lastByeRound !== round - 1);
    if (cands.length === 0) cands = pool; // 이론상 생기지 않음 (생존자 3명 이상 홀수)
    bye = cands[Math.floor(rng() * cands.length)].id;
    pool = pool.filter((p) => p.id !== bye);
  }
  const order = shuffle(pool.map((p) => p.id), rng);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return { pairs, bye };
}
