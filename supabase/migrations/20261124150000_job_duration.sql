-- The song's real length from the search pick, so the worker can reject a wrong video.
alter table public.jobs add column duration real check (duration is null or duration between 0 and 7200);

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
  insert into public.jobs (user_id, kind, parent_id, query, artist, title, album, duration, format, target)
  select v_parent.user_id, 'track', p_parent, left(t ->> 'query', 500), left(t ->> 'artist', 300),
         left(t ->> 'title', 300), left(t ->> 'album', 300), nullif((t ->> 'duration')::real, 0), v_parent.format, v_parent.target
  from jsonb_array_elements(p_tracks) with ordinality as e(t, n)
  where n <= v_cap and coalesce(btrim(t ->> 'query'), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
