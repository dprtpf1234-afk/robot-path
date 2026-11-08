import { requireCaller } from "@/server/auth";
import { BACKEND } from "@/server/config";
import { fail, handle, ok, readJsonBody } from "@/server/http";
import { publish } from "@/server/realtime";
import { canSend } from "@/server/rtAuth";

/** 메모리 모드 전용: 선수가 자기 watch 채널에 보내기 (Supabase 모드는 채널에 직접 보냄, RLS가 확인) */
export const POST = handle(async (req) => {
  if (BACKEND !== "memory") return fail(404, "not_found", "없음");
  const c = await requireCaller(req);
  const b = await readJsonBody<{ topic?: string; event?: string; payload?: Record<string, unknown> }>(req);
  const topic = String(b.topic ?? "");
  const event = String(b.event ?? "");
  if (!["program_changed", "run_started"].includes(event)) return fail(400, "bad_event", "잘못된 이벤트");
  if (!(await canSend(topic, c.userId))) return fail(403, "forbidden", "보낼 수 없는 채널이에요");
  await publish([{ topic, event, payload: b.payload ?? {} }]);
  return ok({ ok: true });
});
