import { fail, handle, ok, readJsonBody } from "@/server/http";
import { hashEntryKey, publicRow, sortRanking, validateEntryKey } from "@/server/ranking";
import { store } from "@/server/store";

/** 내 순위 (entry key는 URL이 아니라 본문으로 보낸다) */
export const POST = handle(async (req, { params }) => {
  const { eventCode } = (await params) as { eventCode: string };
  const event = await store.getEventByCode(eventCode.toUpperCase());
  if (!event) return fail(404, "no_event", "행사를 찾을 수 없어요");
  const b = await readJsonBody<{ entryKey?: string }>(req);
  const h = hashEntryKey(validateEntryKey(b.entryKey));
  const sorted = sortRanking(await store.listRanking(event.id));
  const i = sorted.findIndex((r) => r.entryKeyHash === h);
  return ok({ me: i >= 0 ? publicRow(sorted[i], i) : null }, { headers: { "cache-control": "no-store" } });
});
