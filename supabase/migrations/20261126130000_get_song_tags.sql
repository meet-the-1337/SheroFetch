-- Tags for a list of songs. A function, so song names with quotes or commas need no escaping.
create or replace function public.get_song_tags(p_keys text[])
returns setof public.song_tags
language sql stable security definer set search_path = public as $$
  select t.* from public.song_tags t
  where public.is_member() and t.key = any (p_keys[1:2000])
$$;
revoke all on function public.get_song_tags(text[]) from public, anon;
grant execute on function public.get_song_tags(text[]) to authenticated;
