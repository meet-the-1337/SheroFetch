-- Switch a machine on or off from the website or the app.
--
-- "Off" puts the worker to sleep: it stops fetching, closes its tunnel and lets the phone release
-- its wake lock, and only asks "am I still off?" every few minutes. The owner switches the shared
-- machines; each person switches their own devices.

alter table public.workers add column power text not null default 'on' check (power in ('on', 'off'));
alter table public.workers add column power_changed_at timestamptz;

-- Who may switch a machine: the owner for shared machines, a person for their own devices.
create or replace function public.can_switch(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers w left join public.profiles a on a.id = w.account
    where w.id = p_id and (
      (a.device_of is null and public.is_owner())
      or (a.device_of = auth.uid() and public.is_member())
    )
  )
$$;

create or replace function public.set_machine_power(p_id text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_switch(p_id) then raise exception 'not_your_machine' using errcode = '42501'; end if;
  update public.workers set power = case when p_on then 'on' else 'off' end, power_changed_at = now() where id = p_id;
end $$;

-- The machine asks this while asleep, and on every heartbeat while awake.
create or replace function public.worker_power(p_id text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.worker_check(p_id);
  return coalesce((select power from public.workers where id = p_id), 'on');
end $$;

-- A switched-off machine takes no songs, even if it has not noticed yet.
create or replace function public.worker_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_for uuid := public.my_device_of();
  v_job public.jobs%rowtype;
begin
  perform public.worker_check(p_id);
  select kind into v_kind from public.workers where id = p_id and accepting and power = 'on';
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

-- Every machine this person may switch, with what the switch needs to show.
create or replace function public.my_machines() returns table (
  id text, name text, kind text, personal boolean, power text, online boolean, asleep boolean,
  last_seen timestamptz, accepting boolean, soulseek boolean, battery jsonb, active integer,
  done integer, failed integer, version text
)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.kind, a.device_of is not null, w.power,
         coalesce(w.last_seen > now() - case when w.power = 'off' then interval '12 minutes' else interval '75 seconds' end, false),
         coalesce((w.stats ->> 'asleep')::boolean, false), w.last_seen, w.accepting,
         coalesce((w.stats ->> 'soulseek_account')::boolean, false), w.stats -> 'battery',
         coalesce(jsonb_array_length(w.stats -> 'active'), 0), coalesce((w.stats ->> 'done')::integer, 0),
         coalesce((w.stats ->> 'failed')::integer, 0), w.version
  from public.workers w left join public.profiles a on a.id = w.account
  where (a.device_of = auth.uid() and not a.disabled and public.is_member())
     or (a.device_of is null and public.is_owner())
  order by a.device_of is not null, w.kind, w.name
$$;

revoke all on function public.can_switch(text), public.set_machine_power(text, boolean), public.my_machines() from public, anon;
grant execute on function public.can_switch(text), public.set_machine_power(text, boolean), public.my_machines() to authenticated;
revoke all on function public.worker_power(text) from public, anon;
grant execute on function public.worker_power(text) to authenticated;
