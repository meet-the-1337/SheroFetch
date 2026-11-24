-- SheroFetch: invite-only accounts, one song queue, and the machines that work it.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- people

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  role text not null default 'member' check (role in ('owner', 'member', 'worker')),
  disabled boolean not null default false,
  daily_limit integer not null default 40 check (daily_limit between 0 and 1000),
  invite_code text,
  created_at timestamptz not null default now()
);

create table public.invites (
  code text primary key check (code ~ '^[a-z0-9-]{6,40}$'),
  role text not null default 'member' check (role in ('owner', 'member', 'worker')),
  note text check (char_length(note) <= 80),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and not disabled
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'owner', false) $$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('owner', 'member'), false) $$;
create or replace function public.is_worker() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'worker', false) $$;

-- Every account needs a live invite code. The code decides the role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_inv public.invites%rowtype;
begin
  select * into v_inv from public.invites where code = v_code for update;
  if not found or v_inv.revoked or v_inv.uses >= v_inv.max_uses
     or (v_inv.expires_at is not null and v_inv.expires_at < now()) then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if v_name !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'username_invalid' using errcode = 'P0001';
  end if;
  update public.invites set uses = uses + 1 where code = v_code;
  insert into public.profiles (id, username, role, invite_code) values (new.id, v_name, v_inv.role, v_code);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Friendly checks before sign-up, so the form can say what is wrong.
create or replace function public.check_invite(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invites
    where code = lower(btrim(p_code)) and not revoked and uses < max_uses
      and (expires_at is null or expires_at > now()) and role <> 'worker'
  )
$$;
create or replace function public.username_free(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(btrim(p_name)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_name)))
$$;

-- ---------------------------------------------------------------- machines

create table public.workers (
  id text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) <= 40),
  kind text not null check (kind in ('pc', 'phone', 'server')),
  public_url text check (public_url is null or public_url ~ '^https://[a-z0-9.-]+$'),
  version text,
  capacity integer not null default 1 check (capacity between 0 and 8),
  accepting boolean not null default true,
  stats jsonb not null default '{}',
  last_seen timestamptz,
  account uuid references public.profiles (id) on delete set null
);

create table public.worker_samples (
  id bigint generated always as identity primary key,
  worker_id text not null references public.workers (id) on delete cascade,
  at timestamptz not null default now(),
  cpu real, load1 real, mem_pct real, disk_free_gb real, temp_c real,
  battery_pct real, charging boolean, rx_bps real, tx_bps real, active_jobs integer, latency_ms real
);
create index worker_samples_recent on public.worker_samples (worker_id, at desc);

create table public.worker_events (
  id bigint generated always as identity primary key,
  worker_id text references public.workers (id) on delete cascade,
  at timestamptz not null default now(),
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null check (char_length(message) <= 500),
  detail jsonb
);
create index worker_events_recent on public.worker_events (at desc);

-- ---------------------------------------------------------------- the queue

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null default 'track' check (kind in ('track', 'playlist')),
  parent_id uuid references public.jobs (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 500),
  artist text check (char_length(artist) <= 300),
  title text check (char_length(title) <= 300),
  album text check (char_length(album) <= 300),
  url text check (url is null or (char_length(url) <= 500 and url ~ '^https?://')),
  format text not null default 'mp3' check (format in ('mp3', 'flac', 'opus')),
  target text not null default 'any' check (target in ('any', 'pc', 'phone')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  stage text,
  progress real not null default 0,
  worker_id text references public.workers (id) on delete set null,
  attempts integer not null default 0,
  error text,
  result jsonb,
  lrc text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index jobs_waiting on public.jobs (created_at) where status = 'queued';
create index jobs_running on public.jobs (worker_id) where status = 'running';
create index jobs_mine on public.jobs (user_id, created_at desc);
create index jobs_parent on public.jobs (parent_id);

-- Members get 40 songs a day and 60 waiting at once; the owner has no cap.
create or replace function public.can_queue(p_user uuid, p_count integer default 1) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.disabled then false
      when p.role = 'owner' then true
      when p.role <> 'member' then false
      else (select count(*) from public.jobs j where j.user_id = p.id and j.kind = 'track'
              and j.created_at > now() - interval '1 day') + p_count <= p.daily_limit
       and (select count(*) from public.jobs j where j.user_id = p.id and j.status in ('queued', 'running')) + p_count <= 60
    end
    from public.profiles p where p.id = p_user
  ), false)
$$;

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.workers enable row level security;
alter table public.worker_samples enable row level security;
alter table public.worker_events enable row level security;
alter table public.jobs enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_owner());
create policy invites_read on public.invites for select to authenticated using (public.is_owner());
create policy workers_read on public.workers for select to authenticated using (public.is_owner());
create policy samples_read on public.worker_samples for select to authenticated using (public.is_owner());
create policy events_read on public.worker_events for select to authenticated using (public.is_owner());
create policy jobs_read on public.jobs for select to authenticated using (user_id = auth.uid() or public.is_owner());
create policy jobs_add on public.jobs for insert to authenticated with check (
  user_id = auth.uid() and public.is_member()
  and status = 'queued' and worker_id is null and result is null and lrc is null and error is null
  and stage is null and progress = 0 and attempts = 0 and parent_id is null
  and started_at is null and finished_at is null
  and (target = 'any' or public.is_owner())
  and public.can_queue(auth.uid(), case when kind = 'track' then 1 else 0 end)
);

-- ---------------------------------------------------------------- for everyone

create or replace function public.public_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'machines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'kind', w.kind,
        'online', coalesce(w.last_seen > now() - interval '75 seconds', false),
        'busy', exists (select 1 from public.jobs j where j.worker_id = w.id and j.status = 'running'),
        'last_seen', w.last_seen,
        'fetched_today', (select count(*) from public.jobs j where j.worker_id = w.id and j.status = 'done'
                            and j.finished_at > (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'))
      ) order by w.kind) from public.workers w), '[]'::jsonb),
    'queued', (select count(*) from public.jobs where status = 'queued')
  )
$$;

-- ---------------------------------------------------------------- for members

create or replace function public.machine_links() returns table (id text, kind text, public_url text, online boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.public_url, coalesce(w.last_seen > now() - interval '75 seconds', false)
  from public.workers w where public.is_member()
$$;

create or replace function public.cancel_job(p_job uuid) returns void
language sql security definer set search_path = public as $$
  update public.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
  where (id = p_job or parent_id = p_job) and status in ('queued', 'running')
    and (user_id = auth.uid() or public.is_owner())
$$;

create or replace function public.retry_job(p_job uuid) returns void
language sql security definer set search_path = public as $$
  update public.jobs set status = 'queued', error = null, stage = null, progress = 0, worker_id = null,
    attempts = 0, started_at = null, finished_at = null, result = null, updated_at = now()
  where id = p_job and kind = 'track' and status in ('failed', 'cancelled')
    and (user_id = auth.uid() or public.is_owner()) and public.is_member()
$$;

create or replace function public.forget_job(p_job uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.jobs
  where id = p_job and status in ('done', 'failed', 'cancelled') and (user_id = auth.uid() or public.is_owner())
$$;

-- ---------------------------------------------------------------- for the owner

create or replace function public.create_invite(p_note text default null, p_max_uses integer default 1, p_days integer default 14)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_raw text := '';
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  for i in 0..9 loop v_raw := v_raw || substr(v_alpha, 1 + (get_byte(v_bytes, i) % 31), 1); end loop;
  insert into public.invites (code, role, note, max_uses, expires_at, created_by)
  values ('shero-' || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5), 'member', nullif(left(btrim(coalesce(p_note, '')), 80), ''),
          greatest(1, least(100, p_max_uses)), case when p_days > 0 then now() + make_interval(days => p_days) end, auth.uid())
  returning code into v_raw;
  return v_raw;
end $$;

create or replace function public.revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  update public.invites set revoked = true where code = p_code and role = 'member';
end $$;

create or replace function public.set_member(p_user uuid, p_disabled boolean, p_daily_limit integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  update public.profiles set disabled = p_disabled, daily_limit = greatest(0, least(1000, p_daily_limit))
  where id = p_user and role in ('member', 'worker');
end $$;

-- ---------------------------------------------------------------- for the machines

create or replace function public.worker_check(p_id text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_worker() then raise exception 'workers_only' using errcode = '42501'; end if;
  if exists (select 1 from public.workers where id = p_id and account is distinct from auth.uid()) then
    raise exception 'machine_taken' using errcode = '42501';
  end if;
end $$;

create or replace function public.worker_heartbeat(
  p_id text, p_name text, p_kind text, p_public_url text, p_version text,
  p_capacity integer, p_accepting boolean, p_stats jsonb, p_sample jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_id);
  insert into public.workers (id, name, kind, public_url, version, capacity, accepting, stats, last_seen, account)
  values (p_id, p_name, p_kind, p_public_url, p_version, p_capacity, p_accepting, coalesce(p_stats, '{}'), now(), auth.uid())
  on conflict (id) do update set name = excluded.name, kind = excluded.kind, public_url = excluded.public_url,
    version = excluded.version, capacity = excluded.capacity, accepting = excluded.accepting,
    stats = excluded.stats, last_seen = now();
  if p_sample is not null then
    insert into public.worker_samples (worker_id, cpu, load1, mem_pct, disk_free_gb, temp_c, battery_pct, charging, rx_bps, tx_bps, active_jobs, latency_ms)
    values (p_id, (p_sample ->> 'cpu')::real, (p_sample ->> 'load1')::real, (p_sample ->> 'mem_pct')::real,
            (p_sample ->> 'disk_free_gb')::real, (p_sample ->> 'temp_c')::real, (p_sample ->> 'battery_pct')::real,
            (p_sample ->> 'charging')::boolean, (p_sample ->> 'rx_bps')::real, (p_sample ->> 'tx_bps')::real,
            (p_sample ->> 'active_jobs')::integer, (p_sample ->> 'latency_ms')::real);
    delete from public.worker_samples where worker_id = p_id and at < now() - interval '2 days';
  end if;
end $$;

-- Fair queue: the person with the fewest songs in flight goes first, then the oldest request.
create or replace function public.worker_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_job public.jobs%rowtype;
begin
  perform public.worker_check(p_id);
  select kind into v_kind from public.workers where id = p_id and accepting;
  if v_kind is null then return null; end if;
  select j.* into v_job from public.jobs j join public.profiles p on p.id = j.user_id
  where j.status = 'queued' and (j.target = 'any' or j.target = v_kind) and not p.disabled
  order by (select count(*) from public.jobs r where r.user_id = j.user_id and r.status = 'running'), j.created_at
  limit 1 for update of j skip locked;
  if not found then return null; end if;
  update public.jobs set status = 'running', worker_id = p_id, started_at = now(), attempts = attempts + 1,
    stage = 'Shero picked it up', progress = 0.03, updated_at = now()
  where id = v_job.id returning * into v_job;
  return to_jsonb(v_job) || jsonb_build_object('requester_role', (select role from public.profiles where id = v_job.user_id));
end $$;

-- Progress also tells the machine whether the song was cancelled meanwhile.
create or replace function public.worker_progress(p_id text, p_job uuid, p_stage text, p_progress real) returns text
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform public.worker_check(p_id);
  update public.jobs set stage = left(p_stage, 120), progress = greatest(0, least(1, p_progress)), updated_at = now()
  where id = p_job and worker_id = p_id and status = 'running' returning status into v_status;
  if v_status is null then select status into v_status from public.jobs where id = p_job; end if;
  return coalesce(v_status, 'gone');
end $$;

create or replace function public.worker_finish(p_id text, p_job uuid, p_ok boolean, p_result jsonb, p_lrc text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_id);
  update public.jobs set
    status = case when p_ok then 'done' else 'failed' end,
    result = p_result, lrc = left(p_lrc, 200000), error = left(p_error, 500),
    progress = case when p_ok then 1 else progress end,
    stage = case when p_ok then 'Mil gaya!' else 'Could not fetch' end,
    finished_at = now(), updated_at = now()
  where id = p_job and worker_id = p_id and status = 'running';
end $$;

-- A playlist job turns into one track job per song (30 for members, 300 for the owner).
create or replace function public.worker_add_children(p_id text, p_parent uuid, p_tracks jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_parent public.jobs%rowtype;
  v_cap integer;
  v_n integer;
begin
  perform public.worker_check(p_id);
  select * into v_parent from public.jobs where id = p_parent and worker_id = p_id and kind = 'playlist';
  if not found then return 0; end if;
  v_cap := case when (select role from public.profiles where id = v_parent.user_id) = 'owner' then 300 else 30 end;
  insert into public.jobs (user_id, kind, parent_id, query, artist, title, album, format, target)
  select v_parent.user_id, 'track', p_parent, left(t ->> 'query', 500), left(t ->> 'artist', 300),
         left(t ->> 'title', 300), left(t ->> 'album', 300), v_parent.format, v_parent.target
  from jsonb_array_elements(p_tracks) with ordinality as e(t, n)
  where n <= v_cap and coalesce(btrim(t ->> 'query'), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Songs whose machine went quiet go back to the queue; three strikes and they fail.
create or replace function public.worker_requeue_stale() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_worker() then raise exception 'workers_only' using errcode = '42501'; end if;
  update public.jobs j set
    status = case when j.attempts >= 3 then 'failed' else 'queued' end,
    error = case when j.attempts >= 3 then 'The machine fetching this went quiet three times.' end,
    worker_id = case when j.attempts >= 3 then j.worker_id end,
    stage = null, progress = 0, updated_at = now()
  from public.workers w
  where j.status = 'running' and w.id = j.worker_id
    and (w.last_seen < now() - interval '3 minutes' or j.updated_at < now() - interval '20 minutes');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- On start and on a clean stop, a machine hands back whatever it was holding.
create or replace function public.worker_release(p_id text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform public.worker_check(p_id);
  update public.jobs set status = 'queued', worker_id = null, stage = null, progress = 0, updated_at = now()
  where worker_id = p_id and status = 'running';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.worker_log(p_id text, p_level text, p_message text, p_detail jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_id);
  insert into public.worker_events (worker_id, level, message, detail) values (p_id, p_level, left(p_message, 500), p_detail);
  delete from public.worker_events where at < now() - interval '14 days';
end $$;

-- ---------------------------------------------------------------- privileges

revoke execute on all functions in schema public from public, anon;
grant execute on function public.public_status(), public.check_invite(text), public.username_free(text) to anon, authenticated;
grant execute on function
  public.my_role(), public.is_owner(), public.is_member(), public.is_worker(), public.can_queue(uuid, integer),
  public.machine_links(), public.cancel_job(uuid), public.retry_job(uuid), public.forget_job(uuid),
  public.create_invite(text, integer, integer), public.revoke_invite(text), public.set_member(uuid, boolean, integer),
  public.worker_check(text), public.worker_heartbeat(text, text, text, text, text, integer, boolean, jsonb, jsonb),
  public.worker_claim(text), public.worker_progress(text, uuid, text, real),
  public.worker_finish(text, uuid, boolean, jsonb, text, text), public.worker_add_children(text, uuid, jsonb),
  public.worker_requeue_stale(), public.worker_release(text), public.worker_log(text, text, text, jsonb)
  to authenticated;
revoke all on public.profiles, public.invites, public.workers, public.worker_samples, public.worker_events, public.jobs from anon;

alter publication supabase_realtime add table public.jobs, public.workers, public.worker_events;
