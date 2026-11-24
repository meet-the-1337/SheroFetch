-- Big playlists, and second chances for songs that failed.
--
-- * Playlists no longer drop songs past a fixed 30. A member gets as many as today's limit allows;
--   the rest wait on the playlist row ("pending") and are added with queue_more when the limit
--   allows. The owner gets up to 500 at once.
-- * retry_job_as retries a failed song from an upload the person picked themselves, or in
--   another format. retry_failed retries every failed song of one playlist.

-- Songs a member may still add today.
create or replace function public.songs_left_today(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when p.disabled then 0
    when p.role = 'owner' then 500
    else greatest(0, p.daily_limit - (select count(*)::integer from public.jobs j
      where j.user_id = p.id and j.kind = 'track' and j.created_at > now() - interval '1 day'))
  end
  from public.profiles p where p.id = p_user and (p_user = auth.uid() or public.is_owner() or public.is_worker())
$$;

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
  v_cap := least(500, coalesce(public.songs_left_today(v_parent.user_id), 0));
  insert into public.jobs (user_id, kind, parent_id, query, artist, title, album, duration, format, target)
  select v_parent.user_id, 'track', p_parent, left(t ->> 'query', 500), left(t ->> 'artist', 300),
         left(t ->> 'title', 300), left(t ->> 'album', 300), nullif((t ->> 'duration')::real, 0), v_parent.format, v_parent.target
  from jsonb_array_elements(p_tracks) with ordinality as e(t, n)
  where n <= v_cap and coalesce(btrim(t ->> 'query'), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Adds the next batch of a playlist's waiting songs, as many as today's limit allows.
create or replace function public.queue_more(p_parent uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_parent public.jobs%rowtype;
  v_pending jsonb;
  v_cap integer;
  v_n integer;
begin
  select * into v_parent from public.jobs
  where id = p_parent and kind = 'playlist' and status = 'done' and (user_id = auth.uid() or public.is_owner())
  for update;
  if not found or not public.is_member() then return 0; end if;
  v_pending := coalesce(v_parent.result -> 'pending', '[]'::jsonb);
  v_cap := least(500, coalesce(public.songs_left_today(v_parent.user_id), 0));
  if v_cap = 0 or jsonb_array_length(v_pending) = 0 then return 0; end if;
  insert into public.jobs (user_id, kind, parent_id, query, artist, title, album, duration, format, target)
  select v_parent.user_id, 'track', p_parent, left(t ->> 'query', 500), left(t ->> 'artist', 300),
         left(t ->> 'title', 300), left(t ->> 'album', 300), nullif((t ->> 'duration')::real, 0), v_parent.format, v_parent.target
  from jsonb_array_elements(v_pending) with ordinality as e(t, n)
  where n <= v_cap and coalesce(btrim(t ->> 'query'), '') <> '';
  get diagnostics v_n = row_count;
  update public.jobs set
    result = jsonb_set(jsonb_set(result, '{pending}',
      coalesce((select jsonb_agg(t order by n) from jsonb_array_elements(v_pending) with ordinality as e(t, n) where n > v_cap), '[]'::jsonb)),
      '{tracks}', to_jsonb(coalesce((result ->> 'tracks')::integer, 0) + v_n)),
    updated_at = now()
  where id = p_parent;
  return v_n;
end $$;

-- Retry one failed song, optionally from an exact upload the person picked, or in another format.
-- A picked upload is trusted as the right song, so its length is no longer checked.
create or replace function public.retry_job_as(p_job uuid, p_url text default null, p_format text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_url is not null and (char_length(p_url) > 500 or p_url !~ '^https://(www\.|music\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{6,}') then
    raise exception 'Only a YouTube video link can be picked.';
  end if;
  if p_format is not null and p_format not in ('mp3', 'flac', 'opus') then
    raise exception 'Unknown format.';
  end if;
  update public.jobs set status = 'queued', error = null, stage = null, progress = 0, worker_id = null,
    attempts = 0, started_at = null, finished_at = null, result = null, updated_at = now(),
    url = coalesce(p_url, url),
    duration = case when p_url is not null then null else duration end,
    format = coalesce(p_format, format)
  where id = p_job and kind = 'track' and status in ('failed', 'cancelled')
    and (user_id = auth.uid() or public.is_owner()) and public.is_member();
end $$;

-- Every failed or cancelled song of one playlist goes back in the queue.
create or replace function public.retry_failed(p_parent uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.jobs set status = 'queued', error = null, stage = null, progress = 0, worker_id = null,
    attempts = 0, started_at = null, finished_at = null, result = null, updated_at = now()
  where parent_id = p_parent and kind = 'track' and status in ('failed', 'cancelled')
    and (user_id = auth.uid() or public.is_owner()) and public.is_member();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.songs_left_today(uuid) from public, anon;
revoke all on function public.queue_more(uuid) from public, anon;
revoke all on function public.retry_job_as(uuid, text, text) from public, anon;
revoke all on function public.retry_failed(uuid) from public, anon;
grant execute on function public.songs_left_today(uuid), public.queue_more(uuid),
  public.retry_job_as(uuid, text, text), public.retry_failed(uuid) to authenticated;
