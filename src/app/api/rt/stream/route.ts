import { getCaller } from "@/server/auth";
import { BACKEND } from "@/server/config";
import { bus, presence, presenceList, RtMessage } from "@/server/realtime";
import { canReceive } from "@/server/rtAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 메모리 모드 전용 실시간 채널 (SSE). Supabase 모드에서는 Supabase Realtime 비공개 채널을 쓴다.
 * 받기 권한은 Supabase의 realtime.messages RLS와 같은 규칙(rt_can_receive)으로 확인한다.
 */
export async function GET(req: Request) {
  if (BACKEND !== "memory") return new Response("not found", { status: 404 });
  const url = new URL(req.url);
  const topic = url.searchParams.get("topic") ?? "";
  const caller = await getCaller(req);
  if (!caller || !(await canReceive(topic, caller.userId))) return new Response("forbidden", { status: 403 });
  const presenceKey = url.searchParams.get("presence");
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (m: RtMessage) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onMsg = (m: RtMessage) => send(m);
      bus.on(topic, onMsg);
      const presenceTopic = `presence:${topic}`;
      const onPresence = (m: RtMessage) => send(m);
      bus.on(presenceTopic, onPresence);
      const announce = () => bus.emit(presenceTopic, { topic, event: "presence", payload: { keys: presenceList(topic) } });
      if (presenceKey) {
        const map = presence.get(topic) ?? new Map<string, number>();
        map.set(presenceKey, (map.get(presenceKey) ?? 0) + 1);
        presence.set(topic, map);
        announce();
      } else send({ topic, event: "presence", payload: { keys: presenceList(topic) } });
      const ping = setInterval(() => send({ topic, event: "ping", payload: {} }), 15000);
      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(ping);
        bus.off(topic, onMsg);
        bus.off(presenceTopic, onPresence);
        if (presenceKey) {
          const map = presence.get(topic);
          if (map) {
            const n = (map.get(presenceKey) ?? 1) - 1;
            if (n <= 0) map.delete(presenceKey);
            else map.set(presenceKey, n);
          }
          announce();
        }
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
