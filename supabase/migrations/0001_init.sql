-- 로봇 길찾기 코딩 퍼즐: 테이블 · RLS · 잠금 함수 · Realtime 채널 권한
-- 시각 컬럼(*_at)은 밀리초 epoch(bigint)로 저장한다 (엔진·판정이 ms 단위).
-- 쓰기는 모두 서버 API(service role)로만 한다. 클라이언트에는 읽기 권한만 필요한 곳에 준다.

create extension if not exists pgcrypto;

-- ───────── 교사 ─────────
create table if not exists public.teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ───────── 행사 · 랭킹 · 통계 ─────────
create table if not exists public.events (
  id uuid primary key,
  teacher_id uuid not null references public.teachers (user_id) on delete cascade,
  name text not null,
  code text not null unique check (code ~ '^[A-Z]{5}$'),
  created_at bigint not null
);

create table if not exists public.ranking_entries (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  entry_key_hash text not null,
  player_session text not null,
  display_no int not null,
  nickname text not null,
  total_stars int not null,
  stages_cleared int not null,
  excess_blocks int not null,
  stage_results jsonb not null default '{}',
  hidden boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  unique (event_id, entry_key_hash),
  unique (event_id, display_no)
);
create index if not exists ranking_entries_order on public.ranking_entries (event_id, total_stars desc, stages_cleared desc, excess_blocks, created_at);

create table if not exists public.stage_events (
  id uuid primary key,
  event_id uuid references public.events (id) on delete cascade,
  player_session text not null,
  client_event_id text not null unique,
  type text not null check (type in ('start', 'clear', 'quit')),
  chapter int not null,
  stage int not null,
  grade text not null,
  active_ms int not null default 0,
  created_at bigint not null
);
create index if not exists stage_events_event on public.stage_events (event_id);

create table if not exists public.rate_limits (
  key text primary key,
  window_start bigint not null,
  count int not null
);

-- ───────── 대회 ─────────
create table if not exists public.tournaments (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  teacher_id uuid not null references public.teachers (user_id) on delete cascade,
  name text not null,
  join_code text not null check (join_code ~ '^[0-9]{6}$'),
  preset text not null check (preset in ('low', 'all', 'high')),
  time_limit_sec int not null check (time_limit_sec between 60 and 300),
  status text not null check (status in ('lobby', 'running', 'finished')),
  current_round int not null default 0,
  planned_rounds int not null default 0,
  start_players int not null default 0,
  champion_id uuid,
  screen_match_id uuid,
  created_at bigint not null,
  finished_at bigint,
  version int not null default 0
);
create index if not exists tournaments_code on public.tournaments (join_code);

-- 아래 테이블은 서로 FK를 걸지 않는다(commit 함수가 행을 지웠다 다시 넣기 때문). 대회가 지워지면 함께 지워진다.
create table if not exists public.tournament_players (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  display_name text not null,
  had_bye boolean not null default false,
  last_bye_round int,
  eliminated_round int,
  kicked boolean not null default false,
  joined_at bigint not null,
  unique (tournament_id, user_id)
);

create table if not exists public.matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null,
  slot int not null,
  player_a uuid not null,
  player_b uuid,
  current_attempt_id uuid,
  auto_rematches int not null default 0,
  winner_id uuid,
  result_reason text check (result_reason in ('solved', 'fewer_blocks', 'faster', 'distance', 'teacher', 'bye', 'forfeit')),
  needs_teacher boolean not null default false,
  confirmed boolean not null default false,
  locked boolean not null default false
);

create table if not exists public.match_attempts (
  id uuid primary key,
  match_id uuid not null,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  attempt_no int not null,
  kind text not null,
  grade text not null,
  layout_id text,
  variant text,
  theme_id text,
  content_version int,
  status text not null check (status in ('ready', 'countdown', 'playing', 'paused', 'judging', 'done')),
  start_at bigint,
  ends_at bigint,
  paused_at bigint,
  paused_ms bigint not null default 0,
  result jsonb,
  judged_at bigint,
  created_at bigint not null
);

create table if not exists public.match_records (
  id uuid primary key,
  attempt_id uuid not null,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null,
  solved boolean not null default false,
  best_blocks int,
  best_elapsed_ms bigint,
  min_distance int not null,
  best_program jsonb,
  runs int not null default 0,
  done boolean not null default false,
  last_run_id text,
  last_program jsonb,
  last_final jsonb,
  updated_at bigint not null,
  unique (attempt_id, player_id)
);

create table if not exists public.match_runs (
  id uuid primary key,
  attempt_id uuid not null,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null,
  run_id text not null,
  program jsonb not null,
  received_at bigint not null,
  solved boolean not null,
  blocks int not null,
  min_distance int not null,
  outcome text not null,
  unique (attempt_id, run_id)
);

create table if not exists public.match_logs (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_id uuid,
  attempt_id uuid,
  actor text not null,
  action text not null,
  reason text,
  created_at bigint not null
);

create table if not exists public.spectator_tokens (
  id uuid primary key,
  token_hash text not null unique,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint
);

create table if not exists public.tournament_viewers (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null,
  token_id uuid not null references public.spectator_tokens (id) on delete cascade,
  expires_at bigint not null,
  primary key (tournament_id, user_id)
);

-- ───────── 권한 도우미 (security definer: RLS 안에서 다른 테이블을 읽기 위해) ─────────
create or replace function public.now_ms() returns bigint language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function public.is_tournament_teacher(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t join teachers te on te.user_id = t.teacher_id
    where t.id = tid and t.teacher_id = auth.uid()
  )
$$;

create or replace function public.is_tournament_player(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tournament_players p where p.tournament_id = tid and p.user_id = auth.uid() and not p.kicked)
$$;

create or replace function public.is_tournament_viewer(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournament_viewers v join spectator_tokens s on s.id = v.token_id
    where v.tournament_id = tid and v.user_id = auth.uid()
      and v.expires_at > now_ms() and s.revoked_at is null and s.expires_at > now_ms()
  )
$$;

create or replace function public.my_player_id(tid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from tournament_players where tournament_id = tid and user_id = auth.uid() and not kicked limit 1
$$;

-- ───────── RLS: 모든 테이블에 켠다. 쓰기 정책은 두지 않는다(서버 service role만 쓴다). ─────────
alter table public.teachers enable row level security;
alter table public.events enable row level security;
alter table public.ranking_entries enable row level security;
alter table public.stage_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_attempts enable row level security;
alter table public.match_records enable row level security;
alter table public.match_runs enable row level security;
alter table public.match_logs enable row level security;
alter table public.spectator_tokens enable row level security;
alter table public.tournament_viewers enable row level security;

-- ranking_entries, stage_events, rate_limits, spectator_tokens: 클라이언트 정책 없음 = 접근 불가.

create policy teachers_self on public.teachers for select to authenticated using (user_id = auth.uid());
create policy events_teacher on public.events for select to authenticated using (teacher_id = auth.uid() and exists (select 1 from teachers where user_id = auth.uid()));

create policy tournaments_read on public.tournaments for select to authenticated
  using (is_tournament_teacher(id) or is_tournament_player(id) or is_tournament_viewer(id));
create policy players_read on public.tournament_players for select to authenticated
  using (is_tournament_teacher(tournament_id) or is_tournament_player(tournament_id) or is_tournament_viewer(tournament_id));
create policy matches_read on public.matches for select to authenticated
  using (is_tournament_teacher(tournament_id) or is_tournament_player(tournament_id) or is_tournament_viewer(tournament_id));
create policy attempts_read on public.match_attempts for select to authenticated
  using (is_tournament_teacher(tournament_id) or is_tournament_viewer(tournament_id)
         or exists (select 1 from matches m where m.id = match_id and my_player_id(m.tournament_id) in (m.player_a, m.player_b)));
-- 선수는 자기 기록·실행만. 상대 정보는 공개 뷰로만.
create policy records_read on public.match_records for select to authenticated
  using (is_tournament_teacher(tournament_id) or is_tournament_viewer(tournament_id) or player_id = my_player_id(tournament_id));
create policy runs_read on public.match_runs for select to authenticated
  using (is_tournament_teacher(tournament_id) or is_tournament_viewer(tournament_id) or player_id = my_player_id(tournament_id));
create policy logs_read on public.match_logs for select to authenticated using (is_tournament_teacher(tournament_id));
create policy viewers_self on public.tournament_viewers for select to authenticated using (user_id = auth.uid());

-- 상대 상태 공개 뷰 (성공 여부, 실행 횟수, 제출 완료만). 프로그램은 들어 있지 않다.
create or replace view public.match_records_public with (security_invoker = false) as
  select r.attempt_id, r.player_id, r.solved, r.runs, r.done
  from public.match_records r
  where is_tournament_teacher(r.tournament_id) or is_tournament_player(r.tournament_id) or is_tournament_viewer(r.tournament_id);
grant select on public.match_records_public to authenticated;

-- ───────── 상태 저장 함수: 대회 행을 잠그고 버전을 확인한 뒤 한 트랜잭션으로 저장 ─────────
create or replace function public.commit_tournament(p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  tid uuid := (p -> 'tournament' ->> 'id')::uuid;
  v int;
  t tournaments;
begin
  select version into v from tournaments where id = tid for update;
  if v is null or v <> (p ->> 'expected_version')::int then
    return false;
  end if;
  -- 같은 실행 id 재전송은 충돌로 돌려보내고, 서버가 기존 결과를 다시 읽는다
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p -> 'runs', '[]'::jsonb)) as r(attempt_id uuid, run_id text)
    join match_runs m on m.attempt_id = r.attempt_id and m.run_id = r.run_id
  ) then
    return false;
  end if;

  t := jsonb_populate_record(null::tournaments, p -> 'tournament');
  update tournaments set
    name = t.name, status = t.status, current_round = t.current_round, planned_rounds = t.planned_rounds,
    start_players = t.start_players, champion_id = t.champion_id, screen_match_id = t.screen_match_id,
    finished_at = t.finished_at, time_limit_sec = t.time_limit_sec, version = v + 1
  where id = tid;

  delete from tournament_players where tournament_id = tid and id in (
    select (x ->> 'id')::uuid from jsonb_array_elements(p -> 'players' -> 'changed') x
    union select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'players' -> 'deleted') x);
  insert into tournament_players select * from jsonb_populate_recordset(null::tournament_players, p -> 'players' -> 'changed');

  delete from matches where tournament_id = tid and id in (
    select (x ->> 'id')::uuid from jsonb_array_elements(p -> 'matches' -> 'changed') x
    union select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'matches' -> 'deleted') x);
  insert into matches select * from jsonb_populate_recordset(null::matches, p -> 'matches' -> 'changed');

  delete from match_attempts where tournament_id = tid and id in (
    select (x ->> 'id')::uuid from jsonb_array_elements(p -> 'attempts' -> 'changed') x
    union select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'attempts' -> 'deleted') x);
  insert into match_attempts select * from jsonb_populate_recordset(null::match_attempts, p -> 'attempts' -> 'changed');

  delete from match_records where tournament_id = tid and id in (
    select (x ->> 'id')::uuid from jsonb_array_elements(p -> 'records' -> 'changed') x
    union select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'records' -> 'deleted') x);
  insert into match_records select * from jsonb_populate_recordset(null::match_records, p -> 'records' -> 'changed');

  insert into match_runs select * from jsonb_populate_recordset(null::match_runs, coalesce(p -> 'runs', '[]'::jsonb));
  insert into match_logs select * from jsonb_populate_recordset(null::match_logs, coalesce(p -> 'logs', '[]'::jsonb));
  return true;
end
$$;
revoke all on function public.commit_tournament(jsonb) from public, anon, authenticated;

-- ───────── 요청 제한 (고정 창) ─────────
create or replace function public.hit_rate_limit(p_key text, p_window_sec int, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  c int;
begin
  insert into rate_limits as r (key, window_start, count) values (p_key, now_ms, 1)
  on conflict (key) do update set
    count = case when r.window_start + p_window_sec * 1000 <= now_ms then 1 else r.count + 1 end,
    window_start = case when r.window_start + p_window_sec * 1000 <= now_ms then now_ms else r.window_start end
  returning count into c;
  return c <= p_limit;
end
$$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- ───────── 행사 데이터 삭제: 지워야 할 익명 사용자 id를 돌려준다(서버가 Admin API로 지움) ─────────
create or replace function public.delete_event_data(p_event_id uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(distinct u), '{}') into ids from (
    select p.user_id as u from tournament_players p join tournaments t on t.id = p.tournament_id where t.event_id = p_event_id
    union
    select v.user_id from tournament_viewers v join tournaments t on t.id = v.tournament_id where t.event_id = p_event_id
  ) s;
  delete from rate_limits where key like '%' || p_event_id::text || '%';
  delete from events where id = p_event_id; -- 랭킹·통계·대회·경기·실행·로그·토큰·관객은 cascade
  return ids;
end
$$;
revoke all on function public.delete_event_data(uuid) from public, anon, authenticated;

-- ───────── Realtime Authorization (비공개 채널) ─────────
-- 토픽: tournament:{id} / match:{id} / match:{id}:watch:{playerId}
create or replace function public.rt_can_receive(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(topic, ':');
  tid uuid;
  m matches;
begin
  if parts[1] = 'tournament' and array_length(parts, 1) = 2 then
    tid := parts[2]::uuid;
    return is_tournament_teacher(tid) or is_tournament_player(tid) or is_tournament_viewer(tid);
  elsif parts[1] = 'match' then
    select * into m from matches where id = parts[2]::uuid;
    if m.id is null then return false; end if;
    if array_length(parts, 1) = 2 then
      return is_tournament_teacher(m.tournament_id) or is_tournament_viewer(m.tournament_id)
        or my_player_id(m.tournament_id) in (m.player_a, m.player_b);
    elsif array_length(parts, 1) = 4 and parts[3] = 'watch' then
      -- 선수는 받지 못한다 (상대 블록 보기 방지)
      return is_tournament_teacher(m.tournament_id) or is_tournament_viewer(m.tournament_id);
    end if;
  end if;
  return false;
exception when others then
  return false;
end
$$;

create or replace function public.rt_can_send(topic text, ext text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(topic, ':');
  m matches;
begin
  -- 대기실 접속 상태: 참가자 본인 상태만 (Presence)
  if parts[1] = 'tournament' and array_length(parts, 1) = 2 and ext = 'presence' then
    return is_tournament_player(parts[2]::uuid) or is_tournament_teacher(parts[2]::uuid);
  end if;
  if parts[1] = 'match' and array_length(parts, 1) = 4 and parts[3] = 'watch' then
    select * into m from matches where id = parts[2]::uuid;
    return m.id is not null and parts[4]::uuid = my_player_id(m.tournament_id)
      and parts[4]::uuid in (m.player_a, m.player_b);
  end if;
  return false; -- 그 밖의 채널은 서버만 보낸다
exception when others then
  return false;
end
$$;

drop policy if exists rt_receive on realtime.messages;
create policy rt_receive on realtime.messages for select to authenticated
  using (public.rt_can_receive(realtime.topic()));
drop policy if exists rt_send on realtime.messages;
create policy rt_send on realtime.messages for insert to authenticated
  with check (public.rt_can_send(realtime.topic(), realtime.messages.extension));

-- ───────── 보조 정리 (pg_cron): 30일 지난 행사와 익명 사용자 ─────────
-- 무료 프로젝트는 1주일 미사용 시 정지되어 cron도 멈춘다. 기본 절차는 교사의 「행사 데이터 삭제」다.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('robotpath-cleanup-30d', '17 3 * * *', $c$
      delete from public.events where created_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
      delete from public.stage_events where event_id is null and created_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
      delete from public.rate_limits where window_start < (extract(epoch from now()) * 1000)::bigint - 86400000;
      delete from auth.users where is_anonymous and created_at < now() - interval '30 days';
    $c$);
  end if;
end
$$;
