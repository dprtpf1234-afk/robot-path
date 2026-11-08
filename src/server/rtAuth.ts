import "server-only";
/* 채널 권한 (메모리 모드용). supabase/migrations의 rt_can_receive / rt_can_send와 같은 규칙. */
import { store } from "./store";

async function roleIn(tid: string, userId: string) {
  const s = await store.loadState(tid);
  if (!s) return { s: null, teacher: false, player: null as string | null, viewer: false };
  const teacher = s.tournament.teacherId === userId && (await store.isTeacher(userId));
  const p = s.players.find((x) => x.userId === userId && !x.kicked);
  const viewer = await store.isViewer(tid, userId, Date.now());
  return { s, teacher, player: p?.id ?? null, viewer };
}

async function tournamentOfMatch(matchId: string): Promise<string | null> {
  const g = globalThis as unknown as { __robotDb?: { tournaments: Map<string, { matches: { id: string }[] }> } };
  for (const [tid, s] of g.__robotDb?.tournaments ?? []) if (s.matches.some((m) => m.id === matchId)) return tid;
  return null;
}

export async function canReceive(topic: string, userId: string): Promise<boolean> {
  const parts = topic.split(":");
  if (parts[0] === "tournament" && parts.length === 2) {
    const r = await roleIn(parts[1], userId);
    return r.teacher || !!r.player || r.viewer;
  }
  if (parts[0] === "match") {
    const tid = await tournamentOfMatch(parts[1]);
    if (!tid) return false;
    const r = await roleIn(tid, userId);
    const m = r.s?.matches.find((x) => x.id === parts[1]);
    if (!m) return false;
    if (parts.length === 2) return r.teacher || r.viewer || (!!r.player && (r.player === m.playerA || r.player === m.playerB));
    if (parts.length === 4 && parts[2] === "watch") return r.teacher || r.viewer; // 선수는 받지 못한다
  }
  return false;
}

export async function canSend(topic: string, userId: string): Promise<boolean> {
  const parts = topic.split(":");
  if (parts[0] !== "match" || parts.length !== 4 || parts[2] !== "watch") return false;
  const tid = await tournamentOfMatch(parts[1]);
  if (!tid) return false;
  const r = await roleIn(tid, userId);
  const m = r.s?.matches.find((x) => x.id === parts[1]);
  return !!m && !!r.player && r.player === parts[3] && (m.playerA === r.player || m.playerB === r.player);
}
