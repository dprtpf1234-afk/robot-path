"use client";
/* 서버 API 호출 + 신원(익명 학생·관객 / 교사). Supabase 모드는 Supabase Auth 세션, 메모리 모드는 개발용 토큰. */
import { readJson, removeKey, writeJson } from "./local";
import { browserSupabase, SUPABASE_ENABLED } from "./supabase/browser";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let anonPending: Promise<string> | null = null;

/** 익명 신원. 기기에 저장된 세션을 재사용해 재접속 때 다시 로그인하지 않는다 (익명 로그인 시간당 한도 보호). */
export async function anonToken(): Promise<string> {
  if (SUPABASE_ENABLED) {
    const sb = browserSupabase();
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.access_token;
    anonPending ??= sb.auth.signInAnonymously().then(({ data, error }) => {
      anonPending = null;
      if (error || !data.session) throw new ApiError(503, "anon_failed", "접속하지 못했어요. 잠시 후 다시 해 주세요");
      return data.session.access_token;
    });
    return anonPending;
  }
  const saved = readJson<string | null>("anonToken", null);
  if (saved) return saved;
  anonPending ??= fetch("/api/auth/anon", { method: "POST" })
    .then((r) => r.json())
    .then((d: { token: string }) => {
      writeJson("anonToken", d.token);
      anonPending = null;
      return d.token;
    });
  return anonPending;
}

export async function teacherToken(): Promise<string | null> {
  if (SUPABASE_ENABLED) {
    const { data } = await browserSupabase().auth.getSession();
    if (!data.session || data.session.user.is_anonymous) return null;
    return data.session.access_token;
  }
  return readJson<string | null>("teacherToken", null);
}

export async function teacherLogin(email: string, password: string): Promise<void> {
  if (SUPABASE_ENABLED) {
    const { error } = await browserSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, "bad_login", "이메일 또는 비밀번호가 맞지 않아요");
    return;
  }
  const r = await fetch("/api/auth/teacher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if (!r.ok) throw new ApiError(r.status, d.error, d.message);
  writeJson("teacherToken", d.token);
}

export async function teacherLogout() {
  if (SUPABASE_ENABLED) await browserSupabase().auth.signOut();
  removeKey("teacherToken");
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; as?: "anon" | "teacher" | "none" } = {},
): Promise<T> {
  const as = opts.as ?? "anon";
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = as === "anon" ? await anonToken() : as === "teacher" ? await teacherToken() : null;
    if (as === "teacher" && !token) throw new ApiError(401, "login", "선생님 로그인이 필요해요");
    const r = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    if (r.status === 401 && as === "anon" && attempt === 0 && !SUPABASE_ENABLED) {
      removeKey("anonToken"); // 개발 서버가 다시 시작되면 토큰이 바뀐다
      continue;
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, d.error ?? "error", d.message ?? "문제가 생겼어요");
    return d as T;
  }
  throw new ApiError(401, "unauthorized", "다시 접속해 주세요");
}
