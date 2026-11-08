import "server-only";
/* Supabase(Postgres) 저장소. 서버 API만 service role 키로 쓴다. 테이블·함수는 supabase/migrations 참고. */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Effects, LogRow, RunRow, TournamentRow, TournamentState } from "@/tournament/types";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../config";
import { summarize } from "./memory";
import { commitPayload, fromRow, toRow } from "./rows";
import type { EventRow, RankingRow, SpectatorTokenRow, StageEventRow, Store, ViewerRow } from "./types";

let client: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export const supabaseStore: Store = {
  async isTeacher(userId) {
    const rows = await must(admin().from("teachers").select("user_id").eq("user_id", userId).limit(1));
    return (rows ?? []).length > 0;
  },
  async createEvent(e) {
    await must(admin().from("events").insert(toRow(e)));
  },
  async getEvent(id) {
    const r = await must(admin().from("events").select("*").eq("id", id).maybeSingle());
    return r ? fromRow<EventRow>(r) : null;
  },
  async getEventByCode(code) {
    const r = await must(admin().from("events").select("*").eq("code", code).maybeSingle());
    return r ? fromRow<EventRow>(r) : null;
  },
  async listEvents(teacherId) {
    const rows = await must(admin().from("events").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }));
    return (rows ?? []).map((r) => fromRow<EventRow>(r));
  },
  async deleteEventData(eventId) {
    const anon = await must(admin().rpc("delete_event_data", { p_event_id: eventId }));
    return { anonUserIds: ((anon as string[] | null) ?? []).filter(Boolean) };
  },
  async getRankingByKey(eventId, keyHash) {
    const r = await must(admin().from("ranking_entries").select("*").eq("event_id", eventId).eq("entry_key_hash", keyHash).maybeSingle());
    return r ? fromRow<RankingRow>(r) : null;
  },
  async saveRanking(row, isNew) {
    if (!isNew) {
      await must(admin().from("ranking_entries").update(toRow(row)).eq("id", row.id));
      return row;
    }
    for (let i = 0; i < 5; i++) {
      const top = await must(
        admin().from("ranking_entries").select("display_no").eq("event_id", row.eventId).order("display_no", { ascending: false }).limit(1),
      );
      const displayNo = ((top?.[0]?.display_no as number | undefined) ?? 0) + 1;
      const { error } = await admin().from("ranking_entries").insert(toRow({ ...row, displayNo }));
      if (!error) return { ...row, displayNo };
      if (!/duplicate/i.test(error.message)) throw new Error(error.message);
      if (/entry_key/.test(error.message)) {
        const existing = await this.getRankingByKey(row.eventId, row.entryKeyHash);
        if (existing) return existing;
      }
    }
    throw new Error("ranking insert retry exhausted");
  },
  async listRanking(eventId) {
    const rows = await must(admin().from("ranking_entries").select("*").eq("event_id", eventId));
    return (rows ?? []).map((r) => fromRow<RankingRow>(r));
  },
  async getRanking(id) {
    const r = await must(admin().from("ranking_entries").select("*").eq("id", id).maybeSingle());
    return r ? fromRow<RankingRow>(r) : null;
  },
  async setRankingHidden(id, hidden) {
    await must(admin().from("ranking_entries").update({ hidden }).eq("id", id));
  },
  async deleteRanking(id) {
    await must(admin().from("ranking_entries").delete().eq("id", id));
  },
  async insertStageEvents(rows) {
    if (!rows.length) return 0;
    const data = await must(
      admin().from("stage_events").upsert(rows.map(toRow), { onConflict: "client_event_id", ignoreDuplicates: true }).select("id"),
    );
    return (data ?? []).length;
  },
  async stageEventSummary(eventId) {
    const rows = await must(admin().from("stage_events").select("*").eq("event_id", eventId).limit(50000));
    return summarize((rows ?? []).map((r) => fromRow<StageEventRow>(r)));
  },
  async hit(key, windowSec, limit) {
    const ok = await must(admin().rpc("hit_rate_limit", { p_key: key, p_window_sec: windowSec, p_limit: limit }));
    return ok === true;
  },
  async createTournament(t) {
    await must(admin().from("tournaments").insert(toRow(t)));
  },
  async getTournamentByCode(joinCode) {
    const r = await must(
      admin().from("tournaments").select("*").eq("join_code", joinCode).neq("status", "finished").order("created_at", { ascending: false }).limit(1),
    );
    return r?.[0] ? fromRow<TournamentRow>(r[0]) : null;
  },
  async listTournaments(eventId) {
    const rows = await must(admin().from("tournaments").select("*").eq("event_id", eventId).order("created_at", { ascending: false }));
    return (rows ?? []).map((r) => fromRow<TournamentRow>(r));
  },
  async loadState(tid) {
    const a = admin();
    const [t, players, matches, attempts, records] = await Promise.all([
      must(a.from("tournaments").select("*").eq("id", tid).maybeSingle()),
      must(a.from("tournament_players").select("*").eq("tournament_id", tid)),
      must(a.from("matches").select("*").eq("tournament_id", tid)),
      must(a.from("match_attempts").select("*").eq("tournament_id", tid)),
      must(a.from("match_records").select("*").eq("tournament_id", tid)),
    ]);
    if (!t) return null;
    return {
      tournament: fromRow<TournamentRow>(t),
      players: (players ?? []).map((r) => fromRow(r)),
      matches: (matches ?? []).map((r) => fromRow(r)),
      attempts: (attempts ?? []).map((r) => fromRow(r)),
      records: (records ?? []).map((r) => fromRow(r)),
    } as TournamentState;
  },
  async commitState(before, after, fx) {
    const payload = commitPayload(before, after, fx);
    const ok = await must(admin().rpc("commit_tournament", { p: payload }));
    return ok === true;
  },
  async findRun(attemptId, runId) {
    const r = await must(admin().from("match_runs").select("*").eq("attempt_id", attemptId).eq("run_id", runId).maybeSingle());
    return r ? fromRow<RunRow>(r) : null;
  },
  async listLogs(tid) {
    const rows = await must(admin().from("match_logs").select("*").eq("tournament_id", tid).order("created_at"));
    return (rows ?? []).map((r) => fromRow<LogRow>(r));
  },
  async createSpectatorToken(t) {
    await must(admin().from("spectator_tokens").insert(toRow(t)));
  },
  async findSpectatorToken(hash) {
    const r = await must(admin().from("spectator_tokens").select("*").eq("token_hash", hash).maybeSingle());
    return r ? fromRow<SpectatorTokenRow>(r) : null;
  },
  async listSpectatorTokens(tid) {
    const rows = await must(admin().from("spectator_tokens").select("*").eq("tournament_id", tid));
    return (rows ?? []).map((r) => fromRow<SpectatorTokenRow>(r));
  },
  async revokeSpectatorTokens(tid, at) {
    await must(admin().from("spectator_tokens").update({ revoked_at: at }).eq("tournament_id", tid).is("revoked_at", null));
    await must(admin().from("tournament_viewers").delete().eq("tournament_id", tid));
  },
  async addViewer(v) {
    await must(admin().from("tournament_viewers").upsert(toRow(v), { onConflict: "tournament_id,user_id" }));
  },
  async isViewer(tid, userId, now) {
    const r = await must(
      admin().from("tournament_viewers").select("token_id, expires_at").eq("tournament_id", tid).eq("user_id", userId).maybeSingle(),
    );
    if (!r || Number(r.expires_at) <= now) return false;
    const tok = await must(admin().from("spectator_tokens").select("revoked_at, expires_at").eq("id", r.token_id).maybeSingle());
    return !!tok && !tok.revoked_at && Number(tok.expires_at) > now;
  },
};

export type { ViewerRow };
