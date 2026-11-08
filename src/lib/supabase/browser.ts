"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_ENABLED = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let sb: SupabaseClient | null = null;
export function browserSupabase(): SupabaseClient {
  sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "robotpath-auth" },
  });
  return sb;
}
