-- Genre, mood, language and energy for each song, shared by everyone: once one member's library
-- has tagged "Artist - Title", every other member gets the same tags without asking again.
create table if not exists public.song_tags (
  key        text primary key,          -- lower-case "artist|track"
  genre      text,
  mood       text,
  language   text,
  energy     text,                      -- low, medium, high
  tagged_by  text not null default 'itunes',  -- itunes, or gemini once a key is set
  tagged_at  timestamptz not null default now()
);

alter table public.song_tags enable row level security;

drop policy if exists "members read tags" on public.song_tags;
create policy "members read tags" on public.song_tags for select to authenticated using (public.is_member());

-- Members store what /api/tags answered. A Gemini answer replaces an iTunes-only one, never the reverse.
create or replace function public.save_song_tags(p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then return 0; end if;
  insert into public.song_tags as t (key, genre, mood, language, energy, tagged_by)
  select left(lower(r->>'key'), 300), left(r->>'genre', 60), left(r->>'mood', 60), left(r->>'language', 40),
         left(r->>'energy', 20), case when r->>'tagged_by' = 'gemini' then 'gemini' else 'itunes' end
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'key', '') <> ''
  limit 200
  on conflict (key) do update
    set genre = coalesce(excluded.genre, t.genre), mood = coalesce(excluded.mood, t.mood),
        language = coalesce(excluded.language, t.language), energy = coalesce(excluded.energy, t.energy),
        tagged_by = excluded.tagged_by, tagged_at = now()
    where t.tagged_by = 'itunes' or excluded.tagged_by = 'gemini';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.save_song_tags(jsonb) from public, anon;
grant execute on function public.save_song_tags(jsonb) to authenticated;
grant select on public.song_tags to authenticated;
