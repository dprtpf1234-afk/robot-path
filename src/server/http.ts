import "server-only";
import { NextResponse } from "next/server";
import { TError } from "@/tournament/machine";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (status: number, code: string, message: string) => NextResponse.json({ error: code, message }, { status });

const MAX_BODY = 16 * 1024;

/** 본문 16KB 제한 + JSON 파싱 */
export async function readJsonBody<T = Record<string, unknown>>(req: Request, max = MAX_BODY): Promise<T> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > max) throw new HttpError(413, "too_large", "요청이 너무 커요");
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new HttpError(400, "bad_json", "잘못된 요청이에요");
  }
}

export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError || e instanceof TError) return fail(e.status, e.code, e.message);
      console.error(e);
      return fail(500, "server_error", "잠시 후 다시 해 주세요");
    }
  };
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length <= max ? v : null);
