"use client";
/* 대기열: 단계 통계·랭킹 등록 요청을 기기에 쌓았다가 연결되면 보낸다. 각 항목에는 보낸 플레이어 세션 id가 붙는다. */
import { DEMO } from "./demo";
import { randomHex, readJson, writeJson } from "./local";

export interface StatItem {
  client_event_id: string;
  player_session: string;
  event_code: string | null;
  type: "start" | "clear" | "quit";
  chapter: number;
  stage: number;
  grade: string;
  active_ms: number;
  at: number;
}

export interface RankingItem {
  id: string;
  player_session: string;
  body: unknown;
  at: number;
}

interface Queue {
  stats: StatItem[];
  ranking: RankingItem[];
}

const load = (): Queue => readJson<Queue>("queue", { stats: [], ranking: [] });
const save = (q: Queue) => writeJson("queue", q);

export function enqueueStat(item: Omit<StatItem, "client_event_id" | "at">) {
  const q = load();
  q.stats.push({ ...item, client_event_id: randomHex(12), at: Date.now() });
  q.stats = q.stats.slice(-500);
  save(q);
  void flush();
}

/** 같은 세션의 이전 랭킹 요청은 새 요청으로 바꾼다 (최신 기록 묶음만 보내면 됨) */
export function enqueueRanking(player_session: string, body: unknown) {
  const q = load();
  q.ranking = q.ranking.filter((r) => r.player_session !== player_session);
  q.ranking.push({ id: randomHex(8), player_session, body, at: Date.now() });
  save(q);
}

export function pendingRanking(player_session: string) {
  return load().ranking.some((r) => r.player_session === player_session);
}

let flushing = false;

export async function flush(): Promise<void> {
  if (DEMO) return; // 체험판: 서버가 없다
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  flushing = true;
  try {
    let q = load();
    if (q.stats.length) {
      const batch = q.stats.slice(0, 100);
      const res = await fetch("/api/stats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
      if (res.ok || res.status === 400) {
        const sent = new Set(batch.map((b) => b.client_event_id));
        q = load();
        q.stats = q.stats.filter((s) => !sent.has(s.client_event_id));
        save(q);
      }
    }
    for (const item of load().ranking) {
      const res = await fetch("/api/ranking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item.body) });
      // 4xx(검증 실패)는 다시 보내도 같으므로 버린다. 429·5xx는 남긴다.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        const q2 = load();
        q2.ranking = q2.ranking.filter((r) => r.id !== item.id);
        save(q2);
        const data = await res.json().catch(() => null);
        window.dispatchEvent(new CustomEvent("ranking-result", { detail: { ok: res.ok, status: res.status, data, session: item.player_session } }));
      }
    }
  } catch {
    /* 오프라인 — 다음에 */
  } finally {
    flushing = false;
  }
}

export function startAutoFlush() {
  if (typeof window === "undefined") return () => {};
  const on = () => void flush();
  window.addEventListener("online", on);
  const t = setInterval(on, 20_000);
  void flush();
  return () => {
    window.removeEventListener("online", on);
    clearInterval(t);
  };
}
