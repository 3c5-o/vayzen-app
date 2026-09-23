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
  created_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
returns trigger language plpgsql set search_path=public as $
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
end $;

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
values('app', jsonb_build_object('name','VAYZEN','version','1.0.0','max_video_mb',800))
on conflict (key) do update
set value=jsonb_set(public.app_settings.value,'{max_video_mb}','800'::jsonb,true), updated_at=now();

insert into public.app_settings(key,value)
values('limits', jsonb_build_object(
  'max_video_mb',800,
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
