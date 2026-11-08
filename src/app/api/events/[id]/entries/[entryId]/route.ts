import { requireTeacher } from "@/server/auth";
import { fail, handle, ok, readJsonBody } from "@/server/http";
import { store } from "@/server/store";

async function own(req: Request, id: string, entryId: string) {
  const t = await requireTeacher(req);
  const e = await store.getEvent(id);
  const r = await store.getRanking(entryId);
  if (!e || e.teacherId !== t.userId || !r || r.eventId !== e.id) return null;
  return r;
}

export const PATCH = handle(async (req, { params }) => {
  const { id, entryId } = (await params) as { id: string; entryId: string };
  if (!(await own(req, id, entryId))) return fail(404, "no_entry", "항목이 없어요");
  const b = await readJsonBody<{ hidden?: boolean }>(req);
  await store.setRankingHidden(entryId, !!b.hidden);
  return ok({ ok: true });
});

export const DELETE = handle(async (req, { params }) => {
  const { id, entryId } = (await params) as { id: string; entryId: string };
  if (!(await own(req, id, entryId))) return fail(404, "no_entry", "항목이 없어요");
  await store.deleteRanking(entryId);
  return ok({ ok: true });
});
