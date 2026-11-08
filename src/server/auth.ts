import "server-only";
/* 호출자 확인. Supabase 모드: Supabase JWT를 Auth 서버로 확인. 메모리 모드: 서버 비밀값으로 서명한 개발용 토큰. */
import crypto from "node:crypto";
import { BACKEND } from "./config";
import { HttpError } from "./http";
import { addDevTeacher } from "./store/memory";
import { admin } from "./store/supabase";
import { store } from "./store";

const g = globalThis as unknown as { __devSecret?: string };
const DEV_SECRET = process.env.DEV_AUTH_SECRET ?? (g.__devSecret ??= crypto.randomBytes(32).toString("hex"));

export function signDevToken(userId: string, kind: "anon" | "teacher"): string {
  const body = Buffer.from(JSON.stringify({ u: userId, k: kind, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", DEV_SECRET).update(body).digest("base64url");
  return `dev.${body}.${sig}`;
}

function verifyDevToken(token: string): { userId: string; anon: boolean } | null {
  const [p, body, sig] = token.split(".");
  if (p !== "dev" || !body || !sig) return null;
  const want = crypto.createHmac("sha256", DEV_SECRET).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    return { userId: d.u, anon: d.k === "anon" };
  } catch {
    return null;
  }
}

/** 메모리 모드 개발용 교사 계정: DEV_TEACHERS="email:password,email2:password2" (기본 teacher@example.com:teacher1234) */
export function devTeacherLogin(email: string, password: string): string | null {
  if (BACKEND !== "memory") return null;
  const list = (process.env.DEV_TEACHERS ?? "teacher@example.com:teacher1234").split(",").map((s) => s.trim().split(":"));
  const hit = list.find(([e, pw]) => e === email && pw === password);
  if (!hit) return null;
  const userId = crypto.createHash("sha256").update("teacher:" + email).digest("hex").slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  addDevTeacher(userId);
  return signDevToken(userId, "teacher");
}

export interface Caller {
  userId: string;
  anon: boolean;
}

const cache = new Map<string, { c: Caller; until: number }>();

export async function getCaller(req: Request): Promise<Caller | null> {
  const h = req.headers.get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7) : new URL(req.url).searchParams.get("access_token");
  if (!token) return null;
  if (BACKEND === "memory") {
    const v = verifyDevToken(token);
    return v ? { userId: v.userId, anon: v.anon } : null;
  }
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.c;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  const c = { userId: data.user.id, anon: !!data.user.is_anonymous };
  cache.set(token, { c, until: Date.now() + 60_000 });
  if (cache.size > 2000) cache.clear();
  return c;
}

export async function requireCaller(req: Request): Promise<Caller> {
  const c = await getCaller(req);
  if (!c) throw new HttpError(401, "unauthorized", "다시 접속해 주세요");
  return c;
}

/** 교사 권한은 teachers 테이블에 있는 사용자 id로만 판단한다 (익명 사용자도 authenticated이므로 로그인 여부만으로 주지 않는다) */
export async function requireTeacher(req: Request): Promise<Caller> {
  const c = await requireCaller(req);
  if (c.anon || !(await store.isTeacher(c.userId))) throw new HttpError(403, "not_teacher", "선생님만 할 수 있어요");
  return c;
}

export function hashSecret(s: string, pepper: string): string {
  return crypto.createHmac("sha256", pepper).update(s).digest("hex");
}
