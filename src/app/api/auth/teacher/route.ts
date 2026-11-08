import { devTeacherLogin } from "@/server/auth";
import { BACKEND } from "@/server/config";
import { fail, handle, ok, readJsonBody } from "@/server/http";

/** 메모리 모드 전용 개발용 교사 로그인 (Supabase 모드는 이메일+비밀번호로 Supabase Auth에 로그인) */
export const POST = handle(async (req) => {
  if (BACKEND !== "memory") return fail(404, "not_found", "없음");
  const b = await readJsonBody<{ email?: string; password?: string }>(req);
  const token = devTeacherLogin(String(b.email ?? ""), String(b.password ?? ""));
  if (!token) return fail(401, "bad_login", "이메일 또는 비밀번호가 맞지 않아요");
  return ok({ token });
});
