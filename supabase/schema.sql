-- VAYZEN production schema
create extension if not exists pgcrypto;

create sequence if not exists public.movie_code_seq start 1;
create sequence if not exists public.series_code_seq start 1;
create sequence if not exists public.request_code_seq start 1;
create sequence if not exists public.report_code_seq start 1;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  public_id text unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  original_title text not null default '',
  description text not null default '',
  release_year smallint check (release_year is null or release_year between 1888 and 2100),
  genres text[] not null default '{}',
  language text not null default '',
  country text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  quality text not null default '',
  status text not null default 'published' check (status in ('draft','published','hidden','archived')),
  is_featured boolean not null default false,
  view_count bigint not null default 0,
  external_source text,
  external_id bigint,
  external_metadata jsonb not null default '{}'::jsonb,
  release_date date,
  rating numeric(4,2),
  rating_count integer,
  ingestion_status text not null default 'ready'
    check (ingestion_status in ('ready','queued','processing','partial','failed')),
  expected_seasons integer not null default 0 check (expected_seasons >= 0),
  expected_episodes integer not null default 0 check (expected_episodes >= 0),
  synced_episodes integer not null default 0 check (synced_episodes >= 0),
  playable_episodes integer not null default 0 check (playable_episodes >= 0),
  failed_episodes integer not null default 0 check (failed_episodes >= 0),
  last_ingestion_error jsonb not null default '{}'::jsonb,
  last_episode_sync_at timestamptz,
  ready_at timestamptz,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  public_id text unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  original_title text not null default '',
  description text not null default '',
  release_year smallint check (release_year is null or release_year between 1888 and 2100),
  genres text[] not null default '{}',
  language text not null default '',
  country text not null default '',
  quality text not null default '',
  status text not null default 'published' check (status in ('draft','published','hidden','archived')),
  is_featured boolean not null default false,
  view_count bigint not null default 0,
  external_source text,
  external_id bigint,
  external_metadata jsonb not null default '{}'::jsonb,
  first_air_date date,
  rating numeric(4,2),
  rating_count integer,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.series
  add column if not exists ingestion_status text not null default 'ready',
  add column if not exists expected_seasons integer not null default 0,
  add column if not exists expected_episodes integer not null default 0,
  add column if not exists synced_episodes integer not null default 0,
  add column if not exists playable_episodes integer not null default 0,
  add column if not exists failed_episodes integer not null default 0,
  add column if not exists last_ingestion_error jsonb not null default '{}'::jsonb,
  add column if not exists last_episode_sync_at timestamptz,
  add column if not exists ready_at timestamptz;

create index if not exists series_ingestion_status_idx
  on public.series(ingestion_status,status,updated_at desc);

create or replace function public.vayzen_catalog_facets(p_type text)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $
declare
  result jsonb;
begin
  if p_type not in ('movie','series') then
    raise exception 'invalid catalog type';
  end if;

  if p_type='movie' then
    select jsonb_build_object(
      'genres',coalesce((
        select jsonb_agg(jsonb_build_object('value',genre,'count',cnt) order by cnt desc,genre)
        from (
          select genre,count(*)::int cnt
          from public.movies m, unnest(m.genres) genre
          where m.status='published' and btrim(genre)<>''
          group by genre order by cnt desc,genre limit 40
        ) g
      ),'[]'::jsonb),
      'years',coalesce((
        select jsonb_agg(jsonb_build_object('value',release_year,'count',cnt) order by release_year desc)
        from (
          select release_year,count(*)::int cnt from public.movies
          where status='published' and release_year is not null
          group by release_year order by release_year desc limit 150
        ) y
      ),'[]'::jsonb),
      'countries',coalesce((
        select jsonb_agg(jsonb_build_object('value',country_code,'label',country,'count',cnt) order by cnt desc,country)
        from (
          select country_code,max(country) country,count(*)::int cnt from public.movies
          where status='published' and country_code is not null
          group by country_code order by cnt desc,country_code limit 80
        ) c
      ),'[]'::jsonb)
    ) into result;
  else
    select jsonb_build_object(
      'genres',coalesce((
        select jsonb_agg(jsonb_build_object('value',genre,'count',cnt) order by cnt desc,genre)
        from (
          select genre,count(*)::int cnt
          from public.series s, unnest(s.genres) genre
          where s.status='published' and s.ingestion_status='ready' and btrim(genre)<>''
          group by genre order by cnt desc,genre limit 40
        ) g
      ),'[]'::jsonb),
      'years',coalesce((
        select jsonb_agg(jsonb_build_object('value',release_year,'count',cnt) order by release_year desc)
        from (
          select release_year,count(*)::int cnt from public.series
          where status='published' and ingestion_status='ready' and release_year is not null
          group by release_year order by release_year desc limit 150
        ) y
      ),'[]'::jsonb),
      'countries',coalesce((
        select jsonb_agg(jsonb_build_object('value',country_code,'label',country,'count',cnt) order by cnt desc,country)
        from (
          select country_code,max(country) country,count(*)::int cnt from public.series
          where status='published' and ingestion_status='ready' and country_code is not null
          group by country_code order by cnt desc,country_code limit 80
        ) c
      ),'[]'::jsonb)
    ) into result;
  end if;
  return result;
end;
$;

revoke all on function public.vayzen_catalog_facets(text) from public,anon,authenticated;
grant execute on function public.vayzen_catalog_facets(text) to service_role;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  title text not null default '',
  status text not null default 'published' check (status in ('draft','published','hidden','archived')),
  external_source text,
  external_id bigint,
  external_metadata jsonb not null default '{}'::jsonb,
  air_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id, season_number)
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  public_id text unique,
  episode_number integer not null check (episode_number > 0),
  title text not null default '',
  description text not null default '',
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  quality text not null default '',
  status text not null default 'published' check (status in ('draft','published','hidden','archived')),
  view_count bigint not null default 0,
  external_source text,
  external_id bigint,
  external_metadata jsonb not null default '{}'::jsonb,
  air_date date,
  rating numeric(4,2),
  rating_count integer,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_id, episode_number)
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('movie','series','episode')),
  entity_id uuid not null,
  kind text not null check (kind in ('poster','video','backdrop','subtitle','trailer')),
  variant text not null default 'default',
  channel_id bigint not null,
  channel_message_id bigint not null,
  telegram_file_id text,
  telegram_unique_id text,
  mime_type text,
  file_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, entity_id, kind, variant)
);

create table if not exists public.media_transfer_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text unique not null,
  operation text not null default 'copy_message' check (operation in ('copy_message')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','rolled_back')),
  channel_key text not null,
  from_chat_id bigint not null,
  source_message_id bigint not null,
  target_channel_id bigint,
  target_message_id bigint,
  file_size bigint check (file_size is null or file_size >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 8),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_transfer_jobs_status_idx
  on public.media_transfer_jobs(status, updated_at);

create index if not exists media_transfer_jobs_target_idx
  on public.media_transfer_jobs(target_channel_id, target_message_id)
  where target_channel_id is not null and target_message_id is not null;

alter table public.media_transfer_jobs enable row level security;

create table if not exists public.telegram_channels (
  channel_key text primary key,
  telegram_channel_id bigint unique not null,
  title text not null,
  purpose text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  telegram_user_id bigint primary key,
  display_name text not null default '',
  role text not null default 'moderator'
    check (role in ('owner','secondary_admin','content_manager','requests_manager','user_manager','viewer','moderator','support')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  added_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_users_single_owner_idx
  on public.admin_users ((role))
  where role='owner';

create index if not exists admin_users_role_active_idx
  on public.admin_users(role,is_active,created_at);

create or replace function public.protect_owner_admin()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if old.role='owner' then
      raise exception 'owner account cannot be deleted';
    end if;
    return old;
  end if;
  if old.role='owner' then
    if new.role <> 'owner'
       or new.is_active is not true
       or new.telegram_user_id <> old.telegram_user_id then
      raise exception 'owner account cannot be demoted, disabled, or reassigned';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_owner_admin_trigger on public.admin_users;
create trigger protect_owner_admin_trigger
before update or delete on public.admin_users
for each row execute function public.protect_owner_admin();


create table if not exists public.bot_sessions (
  telegram_user_id bigint primary key,
  flow text not null,
  step text not null,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text unique not null default ('REQ-' || lpad(nextval('public.request_code_seq')::text, 6, '0')),
  requester_key text not null,
  request_type text not null check (request_type in ('movie','series')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  note text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','added','rejected','duplicate')),
  linked_entity_type text check (linked_entity_type is null or linked_entity_type in ('movie','series')),
  linked_entity_id uuid,
  handled_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_code text unique not null default ('REP-' || lpad(nextval('public.report_code_seq')::text, 6, '0')),
  reporter_key text not null,
  entity_type text not null check (entity_type in ('movie','series','episode','other')),
  entity_public_id text not null default '',
  reason text not null,
  details text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','resolved','rejected')),
  handled_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_telegram_id bigint not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  entity_public_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info' check (level in ('info','warning','error','critical')),
  source text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  key_hash text not null,
  action text not null,
  window_start bigint not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, action, window_start)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.assign_movie_public_id()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.public_id is null or btrim(new.public_id)='' then
    new.public_id := 'MOV-' || lpad(nextval('public.movie_code_seq')::text,6,'0');
  end if;
  return new;
end $$;

create or replace function public.assign_series_public_id()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.public_id is null or btrim(new.public_id)='' then
    new.public_id := 'SER-' || lpad(nextval('public.series_code_seq')::text,6,'0');
  end if;
  return new;
end $$;

create or replace function public.assign_episode_public_id()
returns trigger language plpgsql set search_path=public as $$
declare v_series_code text; v_season_number integer;
begin
  select s.public_id,se.season_number into v_series_code,v_season_number
  from public.seasons se join public.series s on s.id=se.series_id
  where se.id=new.season_id;
  if v_series_code is not null then
    new.public_id := v_series_code || '-S' || to_char(v_season_number,'FM00') || '-E' || to_char(new.episode_number,'FM00');
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_movies_public_id on public.movies;
create trigger trg_movies_public_id before insert on public.movies
for each row execute function public.assign_movie_public_id();

drop trigger if exists trg_series_public_id on public.series;
create trigger trg_series_public_id before insert on public.series
for each row execute function public.assign_series_public_id();

drop trigger if exists trg_episode_public_id on public.episodes;
create trigger trg_episode_public_id before insert or update of season_id,episode_number on public.episodes
for each row execute function public.assign_episode_public_id();

do $$
declare t text;
begin
  foreach t in array array['movies','series','seasons','episodes','media_assets','telegram_channels','admin_users','content_requests','reports']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I',t,t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t,t);
  end loop;
end $$;

create index if not exists movies_status_created_idx on public.movies(status,created_at desc);
create index if not exists series_status_created_idx on public.series(status,created_at desc);
create index if not exists episodes_status_created_idx on public.episodes(status,created_at desc);
create index if not exists media_channel_message_idx on public.media_assets(channel_id,channel_message_id);
create index if not exists media_entity_idx on public.media_assets(entity_type,entity_id);
create index if not exists requests_status_created_idx on public.content_requests(status,created_at desc);
create index if not exists reports_status_created_idx on public.reports(status,created_at desc);
create index if not exists api_rate_limits_updated_idx on public.api_rate_limits(updated_at);

alter table public.movies enable row level security;
alter table public.series enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.media_assets enable row level security;
alter table public.telegram_channels enable row level security;
alter table public.admin_users enable row level security;
alter table public.bot_sessions enable row level security;
alter table public.content_requests enable row level security;
alter table public.reports enable row level security;
alter table public.admin_logs enable row level security;
alter table public.system_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists "public read published movies" on public.movies;
create policy "public read published movies" on public.movies
for select to anon,authenticated using (status='published');

drop policy if exists "public read published series" on public.series;
create policy "public read published series" on public.series
for select to anon,authenticated using (status='published');

drop policy if exists "public read published seasons" on public.seasons;
create policy "public read published seasons" on public.seasons
for select to anon,authenticated using (
  status='published' and exists (
    select 1 from public.series s
    where s.id=seasons.series_id and s.status='published'
  )
);

drop policy if exists "public read published episodes" on public.episodes;
create policy "public read published episodes" on public.episodes
for select to anon,authenticated using (
  status='published' and exists (
    select 1 from public.seasons se
    join public.series s on s.id=se.series_id
    where se.id=episodes.season_id
      and se.status='published'
      and s.status='published'
  )
);

grant select on public.movies,public.series,public.seasons,public.episodes to anon,authenticated;
revoke all on public.media_assets,public.telegram_channels,public.admin_users,public.bot_sessions,
public.content_requests,public.reports,public.admin_logs,public.system_logs,public.app_settings,public.api_rate_limits
from anon,authenticated;


create or replace function public.bump_view_count(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_series_id uuid;
begin
  if p_entity_type='movie' then
    update public.movies
    set view_count=view_count+1, updated_at=now()
    where id=p_entity_id and status='published';
  elsif p_entity_type='episode' then
    update public.episodes
    set view_count=view_count+1, updated_at=now()
    where id=p_entity_id and status='published';

    select se.series_id into v_series_id
    from public.episodes e
    join public.seasons se on se.id=e.season_id
    join public.series s on s.id=se.series_id
    where e.id=p_entity_id
      and e.status='published'
      and se.status='published'
      and s.status='published';

    if v_series_id is not null then
      update public.series
      set view_count=view_count+1, updated_at=now()
      where id=v_series_id;
    end if;
  else
    raise exception 'invalid entity type';
  end if;
end;
$$;

revoke all on function public.bump_view_count(text,uuid) from public;
revoke all on function public.bump_view_count(text,uuid) from anon;
revoke all on function public.bump_view_count(text,uuid) from authenticated;
grant execute on function public.bump_view_count(text,uuid) to service_role;


-- Production hardening and request linking
alter table if exists public.profiles
  add column if not exists is_disabled boolean not null default false;

alter table public.content_requests
  add column if not exists linked_entity_type text,
  add column if not exists linked_entity_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='content_requests_linked_entity_type_check'
      and conrelid='public.content_requests'::regclass
  ) then
    alter table public.content_requests
      add constraint content_requests_linked_entity_type_check
      check (linked_entity_type is null or linked_entity_type in ('movie','series'));
  end if;
end $$;

insert into public.app_settings(key,value)
values('app', jsonb_build_object('name','VAYZEN','version','1.0.0','max_video_mb',2000))
on conflict (key) do update
set value=jsonb_set(public.app_settings.value,'{max_video_mb}','2000'::jsonb,true), updated_at=now();

insert into public.app_settings(key,value)
values('limits', jsonb_build_object(
  'max_video_mb',2000,
  'request_daily',5,
  'report_hourly',10,
  'view_window_minutes',15
))
on conflict (key) do update set value=excluded.value,updated_at=now();


create unique index if not exists movies_tmdb_unique_idx
  on public.movies(external_source,external_id)
  where external_source='tmdb' and external_id is not null;

create unique index if not exists series_tmdb_unique_idx
  on public.series(external_source,external_id)
  where external_source='tmdb' and external_id is not null;

create index if not exists seasons_external_idx
  on public.seasons(external_source,external_id)
  where external_id is not null;

create index if not exists episodes_external_idx
  on public.episodes(external_source,external_id)
  where external_id is not null;


-- ============================================================================
-- VAYZEN RELEASE 1.0 PRODUCTION CORE
-- Durable media jobs, trash/restore, subtitles, watch history, health, backups.
-- ============================================================================

alter table public.movies
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by bigint,
  add column if not exists deleted_previous_status text;

alter table public.series
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by bigint,
  add column if not exists deleted_previous_status text;

alter table public.episodes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by bigint,
  add column if not exists deleted_previous_status text;

alter table public.media_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.media_transfer_jobs
  add column if not exists caption text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists entity_public_id text,
  add column if not exists kind text,
  add column if not exists variant text,
  add column if not exists file_metadata jsonb not null default '{}'::jsonb;

create index if not exists movies_deleted_at_idx on public.movies(deleted_at) where deleted_at is not null;
create index if not exists series_deleted_at_idx on public.series(deleted_at) where deleted_at is not null;
create index if not exists episodes_deleted_at_idx on public.episodes(deleted_at) where deleted_at is not null;
create index if not exists media_transfer_jobs_entity_idx on public.media_transfer_jobs(entity_type,entity_id,status,updated_at);
create index if not exists media_transfer_jobs_failed_idx on public.media_transfer_jobs(updated_at desc) where status='failed';

create table if not exists public.subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('movie','episode')),
  entity_id uuid not null,
  language_code text not null,
  label text not null,
  source_format text not null default 'vtt' check (source_format in ('vtt','srt')),
  is_default boolean not null default false,
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type,entity_id,language_code)
);

create table if not exists public.watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('movie','episode')),
  entity_id uuid not null,
  first_watched_at timestamptz not null default now(),
  last_watched_at timestamptz not null default now(),
  completed_at timestamptz,
  play_count integer not null default 1 check (play_count >= 1),
  last_position_seconds numeric not null default 0,
  duration_seconds numeric not null default 0,
  primary key(user_id,entity_type,entity_id)
);

create table if not exists public.media_health_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  checked_assets integer not null default 0,
  healthy_assets integer not null default 0,
  warning_assets integer not null default 0,
  broken_assets integer not null default 0,
  started_by bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  details jsonb not null default '{}'::jsonb
);

create table if not exists public.media_health_issues (
  id uuid primary key default gen_random_uuid(),
  fingerprint text unique not null,
  run_id uuid references public.media_health_runs(id) on delete set null,
  severity text not null check (severity in ('warning','error','critical')),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  entity_type text,
  entity_id uuid,
  entity_public_id text,
  kind text,
  variant text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text unique not null,
  severity text not null check (severity in ('info','warning','error','critical')),
  status text not null default 'open' check (status in ('open','resolved','silenced')),
  source text not null,
  title text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz
);

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  backup_code text unique not null,
  status text not null default 'creating' check (status in ('creating','completed','failed')),
  scope text not null default 'metadata',
  row_counts jsonb not null default '{}'::jsonb,
  checksum text,
  telegram_channel_id bigint,
  telegram_message_id bigint,
  created_by bigint,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create index if not exists subtitle_tracks_entity_idx on public.subtitle_tracks(entity_type,entity_id,created_at);
create index if not exists watch_history_user_recent_idx on public.watch_history(user_id,last_watched_at desc);
create index if not exists media_health_issues_open_idx on public.media_health_issues(status,severity,last_seen_at desc);
create index if not exists operational_alerts_open_idx on public.operational_alerts(status,severity,last_seen_at desc);
create index if not exists backup_snapshots_recent_idx on public.backup_snapshots(created_at desc);

alter table public.subtitle_tracks enable row level security;
alter table public.watch_history enable row level security;
alter table public.media_health_runs enable row level security;
alter table public.media_health_issues enable row level security;
alter table public.operational_alerts enable row level security;
alter table public.backup_snapshots enable row level security;

drop trigger if exists trg_subtitle_tracks_updated_at on public.subtitle_tracks;
create trigger trg_subtitle_tracks_updated_at
before update on public.subtitle_tracks
for each row execute function public.touch_updated_at();

insert into public.app_settings(key,value)
values('release',jsonb_build_object(
  'version','1.0.0',
  'trash_retention_days',14,
  'max_video_mb',2000,
  'media_health_batch_size',60,
  'gateway_retry_attempts',3,
  'watch_completion_ratio',0.92,
  'monitor_interval_seconds',300
))
on conflict (key) do update set value=excluded.value,updated_at=now();



-- ============================================================================
-- VAYZEN MULTI-XTREAM FOUNDATION
-- Canonical catalog stays in movies/series/episodes. Providers are references.
-- Credentials are encrypted by the Edge Function before they reach this table.
-- ============================================================================

alter table public.movies
  add column if not exists identity_key text,
  add column if not exists country_code text,
  add column if not exists origin_country_codes text[] not null default '{}',
  add column if not exists original_language_code text;

alter table public.series
  add column if not exists identity_key text,
  add column if not exists country_code text,
  add column if not exists origin_country_codes text[] not null default '{}',
  add column if not exists original_language_code text;

create or replace function public.vayzen_identity_key(p_type text,p_title text,p_year integer)
returns text
language sql
immutable
set search_path=public
as $$
  select p_type || ':' ||
    btrim(
      regexp_replace(
        lower(
          translate(
            regexp_replace(coalesce(p_title,''),'[ًٌٍَُِّْـ]','','g'),
            'أإآةى',
            'اااهي'
          )
        ),
        '[[:space:][:punct:]]+',
        ' ',
        'g'
      )
    ) || ':' || coalesce(p_year,0)::text
$$;

create or replace function public.set_vayzen_content_identity()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.identity_key=public.vayzen_identity_key(
    case when tg_table_name='movies' then 'movie' else 'series' end,
    new.title,
    new.release_year
  );
  return new;
end
$$;

drop trigger if exists trg_movies_identity_key on public.movies;
create trigger trg_movies_identity_key
before insert or update of title,release_year on public.movies
for each row execute function public.set_vayzen_content_identity();

drop trigger if exists trg_series_identity_key on public.series;
create trigger trg_series_identity_key
before insert or update of title,release_year on public.series
for each row execute function public.set_vayzen_content_identity();

update public.movies
set identity_key=public.vayzen_identity_key('movie',title,release_year)
where identity_key is null or btrim(identity_key)='';

update public.series
set identity_key=public.vayzen_identity_key('series',title,release_year)
where identity_key is null or btrim(identity_key)='';

create index if not exists movies_identity_key_idx
  on public.movies(identity_key)
  where identity_key is not null;

create index if not exists series_identity_key_idx
  on public.series(identity_key)
  where identity_key is not null;

create index if not exists movies_country_code_idx
  on public.movies(country_code,status,created_at desc)
  where country_code is not null;

create index if not exists series_country_code_idx
  on public.series(country_code,status,created_at desc)
  where country_code is not null;

create table if not exists public.xtream_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  server_url text not null check (server_url ~ '^https?://'),
  credentials_ciphertext text not null,
  priority integer not null default 50 check (priority between 0 and 1000),
  is_enabled boolean not null default true,
  sync_movies boolean not null default true,
  sync_series boolean not null default true,
  sync_live boolean not null default false,
  status text not null default 'unknown'
    check (status in ('unknown','active','degraded','down','disabled')),
  last_error text,
  last_checked_at timestamptz,
  last_sync_at timestamptz,
  movie_count integer not null default 0 check (movie_count >= 0),
  series_count integer not null default 0 check (series_count >= 0),
  episode_count integer not null default 0 check (episode_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_provider_refs (
  id uuid primary key default gen_random_uuid(),
  provider_type text not null check (provider_type in ('xtream','tmdb','telegram')),
  provider_account_id uuid references public.xtream_accounts(id) on delete cascade,
  entity_type text not null check (entity_type in ('movie','series','episode')),
  entity_id uuid not null,
  external_id text not null,
  identity_key text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_provider_refs_unique_idx
  on public.content_provider_refs(
    provider_type,
    coalesce(provider_account_id,'00000000-0000-0000-0000-000000000000'::uuid),
    entity_type,
    external_id
  );

create index if not exists content_provider_refs_entity_idx
  on public.content_provider_refs(entity_type,entity_id,is_active);

create index if not exists content_provider_refs_identity_idx
  on public.content_provider_refs(entity_type,identity_key)
  where identity_key is not null;

create table if not exists public.playback_sources (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('movie','episode')),
  entity_id uuid not null,
  source_type text not null check (source_type in ('xtream','telegram')),
  provider_ref_id uuid references public.content_provider_refs(id) on delete cascade,
  xtream_account_id uuid references public.xtream_accounts(id) on delete cascade,
  telegram_asset_id uuid references public.media_assets(id) on delete cascade,
  external_stream_id text,
  external_series_id text,
  container_extension text not null default '',
  video_codec text not null default '',
  audio_codec text not null default '',
  audio_channels integer,
  probe_status text not null default 'unknown'
    check (probe_status in ('unknown','queued','probing','compatible','needs_audio_transcode','needs_full_transcode','failed')),
  compatibility_mode text not null default 'direct'
    check (compatibility_mode in ('direct','hls_remux','audio_aac','full_h264_aac')),
  quality text not null default '',
  language text not null default '',
  country_code text,
  priority integer not null default 50 check (priority between 0 and 1000),
  is_active boolean not null default true,
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','degraded','down')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type='xtream' and xtream_account_id is not null and external_stream_id is not null)
    or
    (source_type='telegram' and telegram_asset_id is not null)
  )
);

alter table public.playback_sources
  add column if not exists video_codec text not null default '',
  add column if not exists audio_codec text not null default '',
  add column if not exists audio_channels integer,
  add column if not exists probe_status text not null default 'unknown',
  add column if not exists compatibility_mode text not null default 'direct';

alter table public.playback_sources drop constraint if exists playback_sources_compatibility_mode_check;
alter table public.playback_sources add constraint playback_sources_compatibility_mode_check
  check (compatibility_mode in ('direct','hls_remux','audio_aac','full_h264_aac'));

create unique index if not exists playback_sources_xtream_unique_idx
  on public.playback_sources(xtream_account_id,entity_type,external_stream_id)
  where source_type='xtream';

create unique index if not exists playback_sources_telegram_unique_idx
  on public.playback_sources(telegram_asset_id)
  where source_type='telegram';

create index if not exists playback_sources_entity_rank_idx
  on public.playback_sources(entity_type,entity_id,is_active,health_status,priority desc);

create table if not exists public.xtream_sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.xtream_accounts(id) on delete cascade,
  mode text not null default 'incremental' check (mode in ('dry_run','full','incremental','series_details')),
  status text not null default 'running' check (status in ('running','completed','partial','failed','cancelled')),
  movies_seen integer not null default 0,
  series_seen integer not null default 0,
  episodes_seen integer not null default 0,
  created_items integer not null default 0,
  merged_items integer not null default 0,
  source_links_created integer not null default 0,
  deactivated_sources integer not null default 0,
  errors_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  started_by bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create index if not exists xtream_accounts_enabled_priority_idx
  on public.xtream_accounts(is_enabled,priority desc,created_at);

create index if not exists xtream_sync_runs_recent_idx
  on public.xtream_sync_runs(account_id,started_at desc);

create table if not exists public.metadata_sync_queue (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'tmdb',
  entity_type text not null check (entity_type in ('movie','series')),
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','not_found','failed')),
  priority integer not null default 50,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,entity_type,entity_id)
);

alter table public.metadata_sync_queue
  add column if not exists max_attempts integer not null default 8,
  add column if not exists last_error_detail jsonb not null default '{}'::jsonb;

alter table public.metadata_sync_queue drop constraint if exists metadata_sync_queue_status_check;
alter table public.metadata_sync_queue add constraint metadata_sync_queue_status_check
  check (status in ('pending','processing','completed','not_found','failed','manual_review','permanent_failed'));

create index if not exists metadata_sync_queue_pick_idx
  on public.metadata_sync_queue(status,next_attempt_at,priority desc,created_at)
  where status in ('pending','failed');

create table if not exists public.telegram_announcement_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  channel_key text not null,
  entity_type text not null check (entity_type in ('movie','series','system')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_announcement_outbox_pick_idx
  on public.telegram_announcement_outbox(status,next_attempt_at,created_at)
  where status in ('pending','failed');

create table if not exists public.xtream_catalog_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.xtream_accounts(id) on delete cascade,
  requested_items integer not null check (requested_items in (10,50,100,500,1000)),
  processed_items integer not null default 0 check (processed_items >= 0),
  movies_seen integer not null default 0 check (movies_seen >= 0),
  series_seen integer not null default 0 check (series_seen >= 0),
  created_items integer not null default 0 check (created_items >= 0),
  merged_items integer not null default 0 check (merged_items >= 0),
  source_links_created integer not null default 0 check (source_links_created >= 0),
  series_ready integer not null default 0 check (series_ready >= 0),
  series_failed integer not null default 0 check (series_failed >= 0),
  series_pending integer not null default 0 check (series_pending >= 0),
  status text not null default 'pending'
    check (status in ('pending','running','completed','partial','failed','cancelled')),
  started_by bigint,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.xtream_catalog_sync_jobs
  add column if not exists series_ready integer not null default 0,
  add column if not exists series_failed integer not null default 0,
  add column if not exists series_pending integer not null default 0;

alter table public.xtream_catalog_sync_jobs drop constraint if exists xtream_catalog_sync_jobs_status_check;
alter table public.xtream_catalog_sync_jobs add constraint xtream_catalog_sync_jobs_status_check
  check (status in ('pending','running','completed','partial','failed','cancelled'));

create unique index if not exists xtream_catalog_sync_jobs_one_active_per_account
  on public.xtream_catalog_sync_jobs(account_id)
  where status in ('pending','running');

create index if not exists xtream_catalog_sync_jobs_pick_idx
  on public.xtream_catalog_sync_jobs(status,created_at)
  where status in ('pending','running');

create table if not exists public.series_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  provider_account_id uuid not null references public.xtream_accounts(id) on delete cascade,
  provider_ref_id uuid references public.content_provider_refs(id) on delete set null,
  external_series_id text not null,
  parent_catalog_job_id uuid references public.xtream_catalog_sync_jobs(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','running','completed','partial','failed','cancelled')),
  expected_seasons integer not null default 0 check (expected_seasons >= 0),
  expected_episodes integer not null default 0 check (expected_episodes >= 0),
  synced_seasons integer not null default 0 check (synced_seasons >= 0),
  synced_episodes integer not null default 0 check (synced_episodes >= 0),
  playable_episodes integer not null default 0 check (playable_episodes >= 0),
  failed_episodes integer not null default 0 check (failed_episodes >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  priority integer not null default 50,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  last_error_detail jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists series_ingest_jobs_one_active_per_series
  on public.series_ingest_jobs(series_id)
  where status in ('queued','running');

create index if not exists series_ingest_jobs_pick_idx
  on public.series_ingest_jobs(status,next_attempt_at,priority desc,created_at)
  where status in ('queued','partial','failed');

create table if not exists public.media_probe_jobs (
  id uuid primary key default gen_random_uuid(),
  playback_source_id uuid not null references public.playback_sources(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','probing','completed','failed','permanent_failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  last_error_detail jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(playback_source_id)
);

create index if not exists media_probe_jobs_pick_idx
  on public.media_probe_jobs(status,next_attempt_at,created_at)
  where status in ('queued','failed');


alter table public.xtream_accounts enable row level security;
alter table public.content_provider_refs enable row level security;
alter table public.playback_sources enable row level security;
alter table public.xtream_sync_runs enable row level security;
alter table public.metadata_sync_queue enable row level security;
alter table public.telegram_announcement_outbox enable row level security;
alter table public.xtream_catalog_sync_jobs enable row level security;
alter table public.series_ingest_jobs enable row level security;
alter table public.media_probe_jobs enable row level security;

revoke all on public.xtream_accounts,public.content_provider_refs,public.playback_sources,public.xtream_sync_runs,
  public.metadata_sync_queue,public.telegram_announcement_outbox,public.xtream_catalog_sync_jobs,
  public.series_ingest_jobs,public.media_probe_jobs
from anon,authenticated;

drop trigger if exists trg_xtream_accounts_updated_at on public.xtream_accounts;
create trigger trg_xtream_accounts_updated_at
before update on public.xtream_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_content_provider_refs_updated_at on public.content_provider_refs;
create trigger trg_content_provider_refs_updated_at
before update on public.content_provider_refs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_playback_sources_updated_at on public.playback_sources;
create trigger trg_playback_sources_updated_at
before update on public.playback_sources
for each row execute function public.touch_updated_at();

drop trigger if exists trg_metadata_sync_queue_updated_at on public.metadata_sync_queue;
create trigger trg_metadata_sync_queue_updated_at
before update on public.metadata_sync_queue
for each row execute function public.touch_updated_at();

drop trigger if exists trg_telegram_announcement_outbox_updated_at on public.telegram_announcement_outbox;
create trigger trg_telegram_announcement_outbox_updated_at
before update on public.telegram_announcement_outbox
for each row execute function public.touch_updated_at();

drop trigger if exists trg_xtream_catalog_sync_jobs_updated_at on public.xtream_catalog_sync_jobs;
create trigger trg_xtream_catalog_sync_jobs_updated_at
before update on public.xtream_catalog_sync_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_series_ingest_jobs_updated_at on public.series_ingest_jobs;
create trigger trg_series_ingest_jobs_updated_at
before update on public.series_ingest_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_media_probe_jobs_updated_at on public.media_probe_jobs;
create trigger trg_media_probe_jobs_updated_at
before update on public.media_probe_jobs
for each row execute function public.touch_updated_at();

insert into public.app_settings(key,value)
values('xtream',jsonb_build_object(
  'enabled',false,
  'sync_mode','incremental',
  'dedupe_strategy','tmdb_then_identity',
  'auto_country_classification',true,
  'source_failover',true,
  'sync_live',false,
  'series_details_on_demand',true,
  'auto_publish',true,
  'sync_batch_size',100
))
on conflict (key) do nothing;

insert into public.app_settings(key,value)
values('content_sync_pipeline',jsonb_build_object(
  'version',2,
  'tmdb_auto_enrich',true,
  'tmdb_worker_batch',20,
  'tmdb_max_attempts',8,
  'series_ingest_batch',1,
  'series_ingest_max_attempts',6,
  'media_probe_batch',3,
  'announcement_worker_batch',2,
  'announcement_list_chunk',35,
  'ready_only_catalog',true,
  'catalog_page_size',40,
  'xtream_batch_choices',jsonb_build_array(10,50,100,500,1000)
))
on conflict (key) do nothing;


-- ============================================================================
-- VAYZEN USER ACCOUNT CORE
-- Profiles, favorites, resume progress, and auth-user profile provisioning.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text not null default '',
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('movie','series')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('movie','episode')),
  entity_id uuid not null,
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_progress enable row level security;

revoke all on public.profiles,public.favorites,public.watch_progress from anon,authenticated;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create index if not exists profiles_created_idx on public.profiles(created_at desc);
create index if not exists favorites_user_recent_idx on public.favorites(user_id,created_at desc);
create index if not exists watch_progress_user_recent_idx on public.watch_progress(user_id,updated_at desc);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,display_name,avatar_url)
  values(
    new.id,
    left(coalesce(new.raw_user_meta_data->>'display_name',''),40),
    left(coalesce(new.raw_user_meta_data->>'avatar_url',''),500)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public,anon,authenticated;

drop trigger if exists on_auth_user_created_vayzen on auth.users;
create trigger on_auth_user_created_vayzen
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create index if not exists content_provider_refs_provider_account_idx
  on public.content_provider_refs(provider_account_id)
  where provider_account_id is not null;

create index if not exists media_health_issues_run_idx
  on public.media_health_issues(run_id)
  where run_id is not null;

create index if not exists playback_sources_provider_ref_idx
  on public.playback_sources(provider_ref_id)
  where provider_ref_id is not null;

create index if not exists subtitle_tracks_media_asset_idx
  on public.subtitle_tracks(media_asset_id)
  where media_asset_id is not null;
