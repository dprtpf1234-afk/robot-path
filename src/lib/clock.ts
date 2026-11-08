"use client";
import { useEffect, useState } from "react";

let offset = 0;
let measured = false;

/** 서버 시각 보정: 접속 시 3번 재서 왕복 시간이 가장 짧은 측정을 쓴다 */
export async function syncClock(): Promise<number> {
  let best: { rtt: number; off: number } | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const t0 = Date.now();
      const r = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await r.json()) as { now: number };
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, off: now - (t0 + t1) / 2 };
    } catch {}
  }
  if (best) {
    offset = best.off;
    measured = true;
  }
  return offset;
}

export const serverNow = () => Date.now() + offset;
export const clockReady = () => measured;

/** 화면 갱신용: interval마다 서버 시각 */
export function useServerNow(interval = 250) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
