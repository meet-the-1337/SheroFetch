-- A person's own device as their private fetcher.
--
-- A member makes a one-time device code in the app and runs the SheroFetch worker on their own PC
-- or Android phone (Termux) with it. That machine account is tied to them: it only fetches their
-- songs, using their own connection and, if they gave one, their own Soulseek account (which stays
-- on their device and is never sent here). Songs asked for "on my device" do not use the shared
-- machines and do not count towards the daily limit.

alter table public.invites add column for_user uuid references public.profiles (id) on delete cascade;
alter table public.profiles add column device_of uuid references public.profiles (id) on delete cascade;

alter table public.jobs drop constraint if exists jobs_target_check;
alter table public.jobs add constraint jobs_target_check check (target in ('any', 'pc', 'phone', 'mine'));

-- Sign-up: a personal device code makes a machine account tied to the person who made the code.
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
  insert into public.profiles (id, username, role, invite_code, device_of)
  values (new.id, v_name, v_inv.role, v_code, case when v_inv.role = 'worker' then v_inv.for_user end);
  return new;
end $$;

-- Who a machine account fetches for: a person's id, or null for the owner's shared machines.
create or replace function public.my_device_of() returns uuid
language sql stable security definer set search_path = public as $$
  select device_of from public.profiles where id = auth.uid()
$$;

-- Songs on one's own device are free: they are left out of the daily and waiting limits.
create or replace function public.can_queue(p_user uuid, p_count integer default 1) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.disabled then false
      when p.role = 'owner' then true
      when p.role <> 'member' then false
      else (select count(*) from public.jobs j where j.user_id = p.id and j.kind = 'track' and j.target <> 'mine'
              and j.created_at > now() - interval '1 day') + p_count <= p.daily_limit
       and (select count(*) from public.jobs j where j.user_id = p.id and j.target <> 'mine' and j.status in ('queued', 'running')) + p_count <= 60
    end
    from public.profiles p where p.id = p_user
  ), false)
$$;

create or replace function public.songs_left_today(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when p.disabled then 0
    when p.role = 'owner' then 500
    else greatest(0, p.daily_limit - (select count(*)::integer from public.jobs j
      where j.user_id = p.id and j.kind = 'track' and j.target <> 'mine' and j.created_at > now() - interval '1 day'))
  end
  from public.profiles p where p.id = p_user and (p_user = auth.uid() or public.is_owner() or public.is_worker())
$$;

drop policy if exists jobs_add on public.jobs;
create policy jobs_add on public.jobs for insert to authenticated with check (
  user_id = auth.uid() and public.is_member()
  and status = 'queued' and worker_id is null and result is null and lrc is null and error is null
  and stage is null and progress = 0 and attempts = 0 and parent_id is null
  and started_at is null and finished_at is null
  and (target in ('any', 'mine') or public.is_owner())
  and public.can_queue(auth.uid(), case when kind = 'track' and target <> 'mine' then 1 else 0 end)
);

-- A playlist for one's own device takes every song at once (up to 500).
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
  v_cap := case when v_parent.target = 'mine' then 500 else least(500, coalesce(public.songs_left_today(v_parent.user_id), 0)) end;
  insert into public.jobs (user_id, kind, parent_id, query, artist, title, album, duration, format, target)
  select v_parent.user_id, 'track', p_parent, left(t ->> 'query', 500), left(t ->> 'artist', 300),
         left(t ->> 'title', 300), left(t ->> 'album', 300), nullif((t ->> 'duration')::real, 0), v_parent.format, v_parent.target
  from jsonb_array_elements(p_tracks) with ordinality as e(t, n)
  where n <= v_cap and coalesce(btrim(t ->> 'query'), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Shared machines never take "on my device" songs. A personal device takes only its person's songs.
create or replace function public.worker_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_for uuid := public.my_device_of();
  v_job public.jobs%rowtype;
begin
  perform public.worker_check(p_id);
  select kind into v_kind from public.workers where id = p_id and accepting;
  if v_kind is null then return null; end if;
  if v_for is not null then
    select j.* into v_job from public.jobs j
    where j.status = 'queued' and j.user_id = v_for and j.target in ('mine', 'any')
    order by (j.target = 'mine') desc, j.created_at
    limit 1 for update of j skip locked;
  else
    select j.* into v_job from public.jobs j join public.profiles p on p.id = j.user_id
    where j.status = 'queued' and (j.target = 'any' or j.target = v_kind) and not p.disabled
    order by (select count(*) from public.jobs r where r.user_id = j.user_id and r.status = 'running'), j.created_at
    limit 1 for update of j skip locked;
  end if;
  if not found then return null; end if;
  update public.jobs set status = 'running', worker_id = p_id, started_at = now(), attempts = attempts + 1,
    stage = 'Shero picked it up', progress = 0.03, updated_at = now()
  where id = v_job.id returning * into v_job;
  return to_jsonb(v_job) || jsonb_build_object('requester_role', (select role from public.profiles where id = v_job.user_id),
    'personal', v_for is not null);
end $$;

-- Members see the shared machines and their own devices, never other people's.
create or replace function public.machine_links() returns table (id text, kind text, public_url text, online boolean)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.public_url, coalesce(w.last_seen > now() - interval '75 seconds', false)
  from public.workers w left join public.profiles a on a.id = w.account
  where public.is_member() and (a.device_of is null or a.device_of = auth.uid())
$$;

-- A one-time code for setting up one of my own devices. Valid for a day; three devices at most.
create or replace function public.create_device_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_raw text := '';
begin
  if not public.is_member() then raise exception 'members_only' using errcode = '42501'; end if;
  if (select count(*) from public.profiles where device_of = auth.uid() and not disabled) >= 3 then
    raise exception 'You already have three devices. Remove one first.' using errcode = 'P0001';
  end if;
  update public.invites set revoked = true where for_user = auth.uid() and uses = 0 and not revoked;
  for i in 0..9 loop v_raw := v_raw || substr(v_alpha, 1 + (get_byte(v_bytes, i) % 31), 1); end loop;
  insert into public.invites (code, role, note, max_uses, expires_at, created_by, for_user)
  values ('device-' || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5), 'worker', 'personal device', 1,
          now() + interval '1 day', auth.uid(), auth.uid())
  returning code into v_raw;
  return v_raw;
end $$;

-- My devices and how they are doing.
create or replace function public.my_devices() returns table (
  id text, name text, kind text, online boolean, last_seen timestamptz, accepting boolean,
  soulseek boolean, battery jsonb, active integer, done integer, failed integer, version text
)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.kind, coalesce(w.last_seen > now() - interval '75 seconds', false), w.last_seen, w.accepting,
         coalesce((w.stats ->> 'soulseek_account')::boolean, false), w.stats -> 'battery',
         coalesce(jsonb_array_length(w.stats -> 'active'), 0), coalesce((w.stats ->> 'done')::integer, 0),
         coalesce((w.stats ->> 'failed')::integer, 0), w.version
  from public.workers w join public.profiles a on a.id = w.account
  where a.device_of = auth.uid() and not a.disabled
  order by w.last_seen desc nulls last
$$;

-- Removing a device switches its machine account off; its songs go back to the queue.
create or replace function public.remove_device(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin
  select w.account into v_acc from public.workers w join public.profiles a on a.id = w.account
  where w.id = p_id and a.device_of = auth.uid();
  if v_acc is null then raise exception 'not_your_device' using errcode = '42501'; end if;
  update public.profiles set disabled = true where id = v_acc;
  update public.jobs set status = 'queued', worker_id = null, stage = null, progress = 0, updated_at = now()
  where worker_id = p_id and status = 'running';
  update public.workers set accepting = false, public_url = null where id = p_id;
end $$;

revoke all on function public.my_device_of(), public.create_device_code(), public.my_devices(), public.remove_device(text) from public, anon;
grant execute on function public.my_device_of(), public.create_device_code(), public.my_devices(), public.remove_device(text) to authenticated;
