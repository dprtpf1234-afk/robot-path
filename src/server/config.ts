import "server-only";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Supabase 환경 변수가 있으면 Supabase, 없으면 로컬 개발용 메모리 백엔드 */
export const BACKEND: "supabase" | "memory" = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";

export const ENTRY_KEY_PEPPER = process.env.ENTRY_KEY_PEPPER ?? (BACKEND === "memory" ? "dev-pepper" : "");
if (BACKEND === "supabase" && !ENTRY_KEY_PEPPER) {
  console.warn("ENTRY_KEY_PEPPER가 설정되지 않았습니다.");
}
