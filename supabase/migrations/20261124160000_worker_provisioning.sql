-- Machine (worker) accounts through the invite system, so a new PC or phone can be set up with
-- `python -m worker.sherofetch_worker --setup` and an owner-made code, without hand-written SQL.

drop function if exists public.create_invite(text, integer, integer);
create or replace function public.create_invite(
  p_note text default null,
  p_max_uses integer default 1,
  p_days integer default 14,
  p_role text default 'member'
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_raw text := '';
  v_role text := lower(btrim(coalesce(p_role, 'member')));
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  if v_role not in ('member', 'worker') then raise exception 'role_invalid' using errcode = '22023'; end if;
  for i in 0..9 loop v_raw := v_raw || substr(v_alpha, 1 + (get_byte(v_bytes, i) % 31), 1); end loop;
  insert into public.invites (code, role, note, max_uses, expires_at, created_by)
  values ((case when v_role = 'worker' then 'machine-' else 'shero-' end) || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5),
          v_role, nullif(left(btrim(coalesce(p_note, '')), 80), ''),
          -- a machine code makes one machine account
          case when v_role = 'worker' then 1 else greatest(1, least(100, p_max_uses)) end,
          case when p_days > 0 then now() + make_interval(days => p_days) end, auth.uid())
  returning code into v_raw;
  return v_raw;
end $$;

-- The website's join form keeps asking for member codes only; the worker setup asks for 'worker'.
drop function if exists public.check_invite(text);
create or replace function public.check_invite(p_code text, p_role text default 'member') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invites
    where code = lower(btrim(p_code)) and not revoked and uses < max_uses
      and (expires_at is null or expires_at > now())
      and role = case when lower(btrim(coalesce(p_role, 'member'))) = 'worker' then 'worker' else 'member' end
  )
$$;

create or replace function public.revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'owner_only' using errcode = '42501'; end if;
  update public.invites set revoked = true where code = p_code and role in ('member', 'worker');
end $$;

revoke execute on function public.check_invite(text, text), public.create_invite(text, integer, integer, text) from public, anon;
grant execute on function public.check_invite(text, text) to anon, authenticated;
grant execute on function public.create_invite(text, integer, integer, text) to authenticated;
