import "server-only";
import crypto from "node:crypto";
import { buildMap } from "@/engine/map";
import { checkProgram, countBlocks, parseProgram } from "@/engine/program";
import { runProgram } from "@/engine/run";
import { starsFor } from "@/engine/score";
import { VARIANTS } from "@/engine/map";
import type { Variant } from "@/engine/types";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { isCandidate, stageOf } from "@/content/stages";
import { checkNickname } from "@/lib/profanity";
import { ENTRY_KEY_PEPPER } from "./config";
import { hashSecret } from "./auth";
import { HttpError } from "./http";
import { RankingRow, StageResult, store } from "./store";

export interface RankingBody {
  eventCode: string;
  nickname: string;
  playerSession: string;
  entryKey: string;
  stages: { chapter: number; stage: number; layoutId: string; variant: string; contentVersion: number; program: unknown }[];
}

export const hashEntryKey = (k: string) => hashSecret(k, ENTRY_KEY_PEPPER);

export function validateEntryKey(k: unknown): string {
  if (typeof k !== "string" || !/^[0-9a-f]{32}$/.test(k)) throw new HttpError(400, "bad_key", "잘못된 요청이에요");
  return k;
}

/** 단계별 기록을 엔진으로 다시 실행해 검증하고 별점·블록 수를 다시 계산한다 */
export function verifyStages(stages: RankingBody["stages"]): Record<string, StageResult> {
  if (!Array.isArray(stages) || stages.length > 15) throw new HttpError(400, "bad_stages", "잘못된 기록이에요");
  const out: Record<string, StageResult> = {};
  for (const st of stages) {
    if (!st || typeof st !== "object") throw new HttpError(400, "bad_stages", "잘못된 기록이에요");
    const spec = stageOf(Number(st.chapter), Number(st.stage));
    if (!spec) throw new HttpError(400, "bad_stage", "없는 단계예요");
    if (out[spec.id]) throw new HttpError(400, "dup_stage", "같은 단계가 두 번 들어 있어요");
    const layout = LAYOUTS_BY_ID[String(st.layoutId)];
    if (!layout || !isCandidate(spec, layout)) throw new HttpError(400, "bad_layout", `${spec.id} 단계의 맵이 아니에요`);
    if (st.contentVersion !== layout.contentVersion) throw new HttpError(400, "old_content", "게임이 업데이트되었어요. 새로고침해 주세요");
    if (!VARIANTS.includes(st.variant as Variant)) throw new HttpError(400, "bad_variant", "잘못된 기록이에요");
    if (spec.fixedLayout && st.variant !== "orig") throw new HttpError(400, "bad_variant", "잘못된 기록이에요");
    const program = parseProgram(st.program);
    if (!program) throw new HttpError(400, "bad_program", "잘못된 프로그램이에요");
    const err = checkProgram(program, { allowedBlocks: spec.allowedBlocks, maxNesting: spec.maxNesting });
    if (err) throw new HttpError(400, err.code, `${spec.id}: ${err.message}`);
    const r = runProgram(buildMap(layout, st.variant as Variant), program, { noTrace: true });
    if (r.outcome !== "success") throw new HttpError(400, "not_solved", `${spec.id} 기록이 도착하지 않아요`);
    const blocks = countBlocks(program);
    out[spec.id] = {
      chapter: spec.chapter,
      stage: spec.stage,
      layoutId: layout.id,
      variant: st.variant,
      contentVersion: layout.contentVersion,
      program,
      stars: starsFor(true, blocks, layout.target),
      blocks,
      target: layout.target,
      genius: blocks < layout.target || undefined,
    };
  }
  return out;
}

function better(a: StageResult, b: StageResult | undefined) {
  if (!b) return true;
  if (a.stars !== b.stars) return a.stars > b.stars;
  return Math.max(0, a.blocks - a.target) < Math.max(0, b.blocks - b.target);
}

export function totals(results: Record<string, StageResult>) {
  const vals = Object.values(results);
  return {
    totalStars: vals.reduce((n, r) => n + r.stars, 0),
    stagesCleared: vals.length,
    excessBlocks: vals.reduce((n, r) => n + Math.max(0, r.blocks - r.target), 0),
  };
}

export function sortRanking(rows: RankingRow[]): RankingRow[] {
  return rows
    .filter((r) => !r.hidden)
    .sort(
      (a, b) =>
        b.totalStars - a.totalStars || b.stagesCleared - a.stagesCleared || a.excessBlocks - b.excessBlocks || a.createdAt - b.createdAt,
    );
}

export const publicRow = (r: RankingRow, i: number) => ({
  rank: i + 1,
  no: r.displayNo,
  nickname: r.nickname,
  stars: r.totalStars,
  cleared: r.stagesCleared,
});

export async function submitRanking(body: RankingBody) {
  const code = typeof body.eventCode === "string" ? body.eventCode.toUpperCase() : "";
  if (!/^[A-Z]{5}$/.test(code)) throw new HttpError(400, "bad_code", "행사 코드는 영문 5자예요");
  const event = await store.getEventByCode(code);
  if (!event) throw new HttpError(404, "no_event", "행사 코드를 다시 확인해 주세요");
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().normalize("NFC") : "";
  const nickErr = checkNickname(nickname);
  if (nickErr) throw new HttpError(400, "bad_nickname", nickErr);
  const key = validateEntryKey(body.entryKey);
  if (typeof body.playerSession !== "string" || body.playerSession.length > 64) throw new HttpError(400, "bad_session", "잘못된 요청이에요");
  const keyHash = hashEntryKey(key);
  if (!(await store.hit(`rank:${event.id}:${keyHash}`, 60, 5))) throw new HttpError(429, "slow_down", "1분 뒤에 다시 등록해 주세요");

  const results = verifyStages(body.stages);
  const now = Date.now();
  const existing = await store.getRankingByKey(event.id, keyHash);
  const merged: Record<string, StageResult> = { ...(existing?.stageResults ?? {}) };
  for (const [id, r] of Object.entries(results)) if (better(r, merged[id])) merged[id] = r;
  const row: RankingRow = {
    id: existing?.id ?? crypto.randomUUID(),
    eventId: event.id,
    entryKeyHash: keyHash,
    playerSession: body.playerSession,
    displayNo: existing?.displayNo ?? 0,
    nickname,
    ...totals(merged),
    stageResults: merged,
    hidden: existing?.hidden ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const saved = await store.saveRanking(row, !existing);
  const sorted = sortRanking(await store.listRanking(event.id));
  const idx = sorted.findIndex((r) => r.id === saved.id);
  return { rank: idx >= 0 ? idx + 1 : null, totalStars: saved.totalStars, stagesCleared: saved.stagesCleared, no: saved.displayNo };
}
