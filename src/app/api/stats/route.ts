import crypto from "node:crypto";
import { clientIp, fail, handle, ok, readJsonBody } from "@/server/http";
import { store } from "@/server/store";

const codeCache = new Map<string, string | null>();

/** 성공 지표용 익명 단계 통계. client_event_id로 중복 전송 제거. */
export const POST = handle(async (req) => {
  if (!(await store.hit(`ip:stats:${clientIp(req)}`, 60, 300))) return fail(429, "slow_down", "잠시 후");
  const b = await readJsonBody<{ events?: unknown[] }>(req, 64 * 1024);
  if (!Array.isArray(b.events) || b.events.length > 100) return fail(400, "bad", "잘못된 요청");
  const rows = [];
  for (const raw of b.events) {
    const e = raw as Record<string, unknown>;
    if (
      typeof e.client_event_id !== "string" || e.client_event_id.length > 40 ||
      typeof e.player_session !== "string" || e.player_session.length > 64 ||
      !["start", "clear", "quit"].includes(String(e.type)) ||
      !Number.isInteger(e.chapter) || !Number.isInteger(e.stage) ||
      typeof e.grade !== "string" || e.grade.length > 4
    ) continue;
    let eventId: string | null = null;
    const code = typeof e.event_code === "string" ? e.event_code.toUpperCase() : null;
    if (code && /^[A-Z]{5}$/.test(code)) {
      if (!codeCache.has(code)) codeCache.set(code, (await store.getEventByCode(code))?.id ?? null);
      eventId = codeCache.get(code) ?? null;
      if (!eventId) codeCache.delete(code);
    }
    rows.push({
      id: crypto.randomUUID(),
      eventId,
      playerSession: e.player_session,
      clientEventId: e.client_event_id,
      type: e.type as "start" | "clear" | "quit",
      chapter: e.chapter as number,
      stage: e.stage as number,
      grade: e.grade,
      activeMs: Math.max(0, Math.min(6 * 3600_000, Number(e.active_ms) || 0)),
      createdAt: typeof e.at === "number" ? e.at : Date.now(),
    });
  }
  const n = await store.insertStageEvents(rows);
  return ok({ inserted: n });
});
