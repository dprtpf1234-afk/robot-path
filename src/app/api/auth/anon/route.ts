import crypto from "node:crypto";
import { signDevToken } from "@/server/auth";
import { BACKEND, CONFIG_PROBLEM } from "@/server/config";
import { fail, ok } from "@/server/http";

/** 메모리 모드 전용 익명 로그인 (Supabase 모드는 클라이언트가 supabase.auth.signInAnonymously 사용) */
export async function POST() {
  if (BACKEND !== "memory") return fail(404, "not_found", "없음");
  if (CONFIG_PROBLEM) return fail(503, "not_configured", CONFIG_PROBLEM);
  const userId = crypto.randomUUID();
  return ok({ userId, token: signDevToken(userId, "anon") });
}
