import { requireTeacher } from "@/server/auth";
import { BACKEND } from "@/server/config";
import { fail, handle, ok } from "@/server/http";
import { sortRanking } from "@/server/ranking";
import { store } from "@/server/store";
import { admin } from "@/server/store/supabase";

async function ownEvent(req: Request, id: string) {
  const t = await requireTeacher(req);
  const e = await store.getEvent(id);
  if (!e || e.teacherId !== t.userId) return null;
  return e;
}

/** 교사용 행사 상세: 랭킹 전체(숨김 포함), 성공 지표, 대회 목록 */
export const GET = handle(async (req, { params }) => {
  const { id } = (await params) as { id: string };
  const e = await ownEvent(req, id);
  if (!e) return fail(404, "no_event", "행사를 찾을 수 없어요");
  const all = await store.listRanking(e.id);
  const visible = sortRanking(all);
  const rank = new Map(visible.map((r, i) => [r.id, i + 1]));
  const entries = all
    .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999) || a.createdAt - b.createdAt)
    .map((r) => ({
      id: r.id,
      rank: rank.get(r.id) ?? null,
      no: r.displayNo,
      nickname: r.nickname,
      stars: r.totalStars,
      cleared: r.stagesCleared,
      excess: r.excessBlocks,
      hidden: r.hidden,
      genius: Object.values(r.stageResults).filter((s) => s.genius).map((s) => ({ stage: `${s.chapter}-${s.stage}`, layoutId: s.layoutId, blocks: s.blocks, target: s.target })),
      updatedAt: r.updatedAt,
    }));
  const stats = await store.stageEventSummary(e.id);
  const tournaments = await store.listTournaments(e.id);
  return ok({ event: e, entries, stats, tournaments }, { headers: { "cache-control": "no-store" } });
});

/** 행사 데이터 삭제: 랭킹·통계·대회·경기·실행·로그·관객 토큰·제한 카운터·익명 사용자 */
export const DELETE = handle(async (req, { params }) => {
  const { id } = (await params) as { id: string };
  const e = await ownEvent(req, id);
  if (!e) return fail(404, "no_event", "행사를 찾을 수 없어요");
  const { anonUserIds } = await store.deleteEventData(e.id);
  let deletedUsers = 0;
  if (BACKEND === "supabase") {
    for (const uid of anonUserIds) {
      const { data } = await admin().auth.admin.getUserById(uid);
      if (data.user && data.user.is_anonymous) {
        const { error } = await admin().auth.admin.deleteUser(uid);
        if (!error) deletedUsers++;
      }
    }
  } else deletedUsers = anonUserIds.length;
  return ok({ deleted: true, deletedUsers });
});
