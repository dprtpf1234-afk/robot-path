import "server-only";
/* 서버 → 채널 방송. 메모리 모드: 프로세스 안 이벤트 버스(SSE로 전달). Supabase 모드: Realtime REST 방송(비공개 채널). */
import { EventEmitter } from "node:events";
import { BACKEND, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./config";

export interface RtMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

const g = globalThis as unknown as { __rtBus?: EventEmitter; __presence?: Map<string, Map<string, number>> };
export const bus = (g.__rtBus ??= new EventEmitter().setMaxListeners(1000));
/** topic → (presenceKey → 연결 수) */
export const presence = (g.__presence ??= new Map());

export async function publish(msgs: RtMessage[]) {
  if (!msgs.length) return;
  if (BACKEND === "memory") {
    for (const m of msgs) bus.emit(m.topic, m);
    return;
  }
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ messages: msgs.map((m) => ({ topic: m.topic, event: m.event, payload: m.payload, private: true })) }),
    });
  } catch (e) {
    // 표시용 메시지일 뿐이다. 클라이언트는 snapshot으로 다시 맞춘다.
    console.warn("broadcast failed", e);
  }
}

export function presenceList(topic: string): string[] {
  return [...(presence.get(topic)?.keys() ?? [])];
}
