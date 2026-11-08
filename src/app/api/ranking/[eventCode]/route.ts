import { fail, handle } from "@/server/http";
import { publicRow, sortRanking } from "@/server/ranking";
import { store } from "@/server/store";

/** 공개 랭킹: 순위·표시용 번호·닉네임·별 수·깬 단계 수만. CDN 3초 캐시. */
export const GET = handle(async (req, { params }) => {
  const { eventCode } = (await params) as { eventCode: string };
  const code = eventCode.toUpperCase();
  if (!/^[A-Z]{5}$/.test(code)) return fail(400, "bad_code", "행사 코드는 영문 5자예요");
  const event = await store.getEventByCode(code);
  if (!event) return fail(404, "no_event", "행사를 찾을 수 없어요");
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20));
  const sorted = sortRanking(await store.listRanking(event.id));
  return Response.json(
    { event: { name: event.name, code: event.code }, total: sorted.length, top: sorted.slice(0, limit).map(publicRow) },
    { headers: { "cache-control": "public, max-age=0, s-maxage=3, stale-while-revalidate=2" } },
  );
});
