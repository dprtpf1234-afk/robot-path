import crypto from "node:crypto";
import { requireTeacher } from "@/server/auth";
import { fail, handle, ok, readJsonBody } from "@/server/http";
import { store } from "@/server/store";

export const GET = handle(async (req) => {
  const t = await requireTeacher(req);
  return ok({ events: await store.listEvents(t.userId) }, { headers: { "cache-control": "no-store" } });
});

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 I·O 제외

export const POST = handle(async (req) => {
  const t = await requireTeacher(req);
  const b = await readJsonBody<{ name?: string; code?: string }>(req);
  const name = String(b.name ?? "").trim().slice(0, 40);
  if (!name) return fail(400, "bad_name", "행사 이름을 써 주세요");
  let code = String(b.code ?? "").trim().toUpperCase();
  if (code && !/^[A-Z]{5}$/.test(code)) return fail(400, "bad_code", "행사 코드는 영문 대문자 5자예요");
  if (code && (await store.getEventByCode(code))) return fail(409, "dup_code", "이미 쓰는 코드예요");
  for (let i = 0; !code && i < 20; i++) {
    const c = Array.from(crypto.randomBytes(5), (x) => LETTERS[x % LETTERS.length]).join("");
    if (!(await store.getEventByCode(c))) code = c;
  }
  const e = { id: crypto.randomUUID(), teacherId: t.userId, name, code, createdAt: Date.now() };
  await store.createEvent(e);
  return ok({ event: e });
});
