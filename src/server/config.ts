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

/**
 * 배포 환경에서 메모리 백엔드는 쓸 수 없다 (서버리스 인스턴스마다 데이터가 따로라 대회·랭킹이 사라지고,
 * 개발용 교사 계정이 열린다). 그런 경우 API가 데이터를 잃는 대신 503으로 멈추게 한다.
 */
export const CONFIG_PROBLEM: string | null =
  BACKEND === "memory" && (process.env.VERCEL || process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_BACKEND !== "1")
    ? "서버 설정이 필요해요 (Supabase 환경 변수가 없음)"
    : BACKEND === "supabase" && !process.env.ENTRY_KEY_PEPPER
      ? "서버 설정이 필요해요 (ENTRY_KEY_PEPPER가 없음)"
      : null;
