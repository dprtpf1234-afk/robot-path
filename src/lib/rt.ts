"use client";
/* 실시간 채널 (표시용). Supabase 모드: 비공개 채널(RLS로 권한 확인). 메모리 모드: SSE + POST. */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserSupabase, SUPABASE_ENABLED } from "./supabase/browser";

export interface SubOpts {
  token: string;
  presenceKey?: string;
  onPresence?: (keys: string[]) => void;
  onReconnect?: () => void;
}

const channels = new Map<string, RealtimeChannel>();

export function subscribe(topic: string, onMsg: (event: string, payload: Record<string, unknown>) => void, opts: SubOpts): () => void {
  if (SUPABASE_ENABLED) {
    const sb = browserSupabase();
    sb.realtime.setAuth(opts.token);
    const ch = sb.channel(topic, {
      config: { private: true, broadcast: { self: false }, ...(opts.presenceKey ? { presence: { key: opts.presenceKey } } : {}) },
    });
    ch.on("broadcast", { event: "*" }, (m) => onMsg(m.event, (m.payload ?? {}) as Record<string, unknown>));
    if (opts.onPresence) ch.on("presence", { event: "sync" }, () => opts.onPresence!(Object.keys(ch.presenceState())));
    let first = true;
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (opts.presenceKey) void ch.track({ at: Date.now() });
        if (!first) opts.onReconnect?.();
        first = false;
      }
    });
    channels.set(topic, ch);
    return () => {
      channels.delete(topic);
      void sb.removeChannel(ch);
    };
  }
  const q = new URLSearchParams({ topic, access_token: opts.token });
  if (opts.presenceKey) q.set("presence", opts.presenceKey);
  const es = new EventSource(`/api/rt/stream?${q}`);
  let opened = false;
  es.onopen = () => {
    if (opened) opts.onReconnect?.();
    opened = true;
  };
  es.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data) as { event: string; payload: Record<string, unknown> };
      if (m.event === "presence") opts.onPresence?.((m.payload.keys as string[]) ?? []);
      else if (m.event !== "ping") onMsg(m.event, m.payload);
    } catch {}
  };
  return () => es.close();
}

/** 선수 → 자기 watch 채널 */
export async function sendWatch(topic: string, event: "program_changed" | "run_started", payload: Record<string, unknown>, token: string) {
  if (SUPABASE_ENABLED) {
    let ch = channels.get(topic);
    if (!ch) {
      const sb = browserSupabase();
      sb.realtime.setAuth(token);
      ch = sb.channel(topic, { config: { private: true } });
      ch.subscribe();
      channels.set(topic, ch);
    }
    await ch.send({ type: "broadcast", event, payload });
    return;
  }
  await fetch("/api/rt/send", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ topic, event, payload }),
  }).catch(() => {});
}
