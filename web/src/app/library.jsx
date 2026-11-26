// The library: every fetched song, browsed the way a music player browses (songs, playlists,
// artists, albums, genres, moods, languages), with one search box that filters all of them as you
// type. Saving comes first: on the phone each song goes into Music/SheroFetch for Poweramp and
// any other player; the small Check button is only for hearing that the right song came back.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, rpc } from '../lib/supabase.js'
import { fileUrl, thumbUrl, machineName, fmtTime, loadLrc } from './data.js'
import { usePlaylists, SavePicker } from './lists.jsx'
import { isNative, apiUrl, saveToPhone, savedPath, localSrc, phoneIndex, audioName, localArt, openInPlayer, writeJam } from '../lib/native.js'

// Album names the resolver or tagger uses when the real album is not known.
export const PLACEHOLDER_ALBUMS = ['Unknown Album', 'SheroFetch', 'Official Studio Release', 'instrumental']

/* ---------------------------------------------------------------- covers */

export function Cover({ remote, path, size = 48 }) {
  const ref = useRef(null)
  const [src, setSrc] = useState(remote || null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setSrc(remote || null); setFailed(false) }, [remote])
  useEffect(() => {
    if ((src && !failed) || !path || !isNative) return undefined
    let live = true
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return
      io.disconnect()
      localArt(path).then((a) => { if (live && a) { setSrc(a); setFailed(false) } })
    }, { rootMargin: '300px' })
    if (ref.current) io.observe(ref.current)
    return () => { live = false; io.disconnect() }
  }, [src, failed, path])
  if (!src || failed) return <span ref={ref} className="cover cover--none" aria-hidden="true" />
  return <img className="cover" src={src} alt="" width={size} height={size} loading="lazy" onError={() => { if (src !== remote || !path) setSrc(null); setFailed(true) }} />
}

/* ---------------------------------------------------------------- tags (genre, mood, language) */

const tagKey = (artist, track) => `${String(artist || '').trim().toLowerCase()}|${String(track || '').trim().toLowerCase()}`
const asked = new Set()

/** Tags for every song, from the shared table; songs nobody has tagged yet are sent to /api/tags. */
function useTags(songs) {
  const [tags, setTags] = useState(() => new Map())
  const keys = useMemo(() => [...new Set(songs.map((s) => tagKey(s.r.artist, s.r.track)))], [songs])
  useEffect(() => {
    let live = true
    const merge = (rows) => live && rows?.length && setTags((m) => { const n = new Map(m); rows.forEach((t) => n.set(t.key, t)); return n })
    ;(async () => {
      // Songs with a Gemini answer are done; iTunes-only ones are asked again once per session.
      const have = new Set()
      try {
        const data = await rpc('get_song_tags', { p_keys: keys })
        data?.forEach((t) => { if (t.tagged_by === 'gemini') have.add(t.key) })
        merge(data)
      } catch { /* tags are a nice-to-have */ }
      const missing = songs.filter((s) => { const k = tagKey(s.r.artist, s.r.track); return !have.has(k) && !asked.has(k) })
      if (!missing.length) return
      missing.forEach((s) => asked.add(tagKey(s.r.artist, s.r.track)))
      const token = (await supabase.auth.getSession()).data.session?.access_token
      for (let i = 0; i < missing.length; i += 25) {
        try {
          const res = await fetch(apiUrl('/api/tags'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ songs: missing.slice(i, i + 25).map((s) => ({ artist: s.r.artist, track: s.r.track, album: s.r.album })) }) })
          const { tags: got } = await res.json()
          if (got?.length) { merge(got); rpc('save_song_tags', { p_rows: got }).catch(() => {}) }
        } catch { /* tags are a nice-to-have; the library works without them */ }
      }
    })()
    return () => { live = false }
  }, [keys.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps
  return tags
}

/* ---------------------------------------------------------------- grouping */

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const splitArtists = (a) => String(a || 'Unknown artist').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i).map((x) => x.trim()).filter(Boolean)

const CATS = [
  ['songs', 'Songs'],
  ['playlists', 'Playlists'],
  ['artists', 'Artists'],
  ['albums', 'Albums'],
  ['genres', 'Genres'],
  ['moods', 'Moods'],
  ['languages', 'Languages'],
]
const ONE = { playlists: 'playlist', artists: 'artist', albums: 'album', genres: 'genre', moods: 'mood', languages: 'language' }

function groupsOf(cat, s) {
  if (cat === 'playlists') return [s.playlist || 'Single songs']
  if (cat === 'artists') return splitArtists(s.r.artist)
  if (cat === 'albums') return [s.r.album && !PLACEHOLDER_ALBUMS.includes(s.r.album) ? s.r.album : 'Singles']
  if (cat === 'genres') return [s.tags?.genre || 'Not tagged yet']
  if (cat === 'moods') return [cap(s.tags?.mood) || 'Not tagged yet']
  if (cat === 'languages') return [s.tags?.language || 'Not tagged yet']
  return []
}

function group(cat, songs) {
  const m = new Map()
  for (const s of songs) for (const g of groupsOf(cat, s)) (m.get(g) || m.set(g, []).get(g)).push(s)
  return [...m.entries()].map(([name, list]) => ({ name, list })).sort((a, b) => (a.name === 'Not tagged yet') - (b.name === 'Not tagged yet') || b.list.length - a.list.length || a.name.localeCompare(b.name))
}

const SORTS = {
  recent: ['Recently added', (a, b) => new Date(b.j.finished_at || 0) - new Date(a.j.finished_at || 0)],
  title: ['Title', (a, b) => String(a.r.track).localeCompare(String(b.r.track))],
  artist: ['Artist', (a, b) => String(a.r.artist).localeCompare(String(b.r.artist)) || String(a.r.track).localeCompare(String(b.r.track))],
  length: ['Length', (a, b) => (b.r.duration || 0) - (a.r.duration || 0)],
}

/** The typed text, marked inside a name. */
function Hl({ text, q }) {
  const t = String(text || '')
  const i = q ? t.toLowerCase().indexOf(q) : -1
  if (i < 0) return t
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>
}

// Switching views just re-keys .lib__view, whose CSS entrance slides the new view in.
const swap = (fn) => fn()

/* ---------------------------------------------------------------- saving */

const AUTO_KEY = 'sf-autosave'
export const autoSaveOn = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true } }
const setAutoSave = (on) => { try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off') } catch { /* storage off */ } }
// Saves started anywhere (a tap here, or the automatic saver) report here, so every row shows them.
const say = (id, value) => dispatchEvent(new CustomEvent('sf-saving', { detail: { id, value } }))

export async function saveOne(j, links) {
  say(j.id, 0)
  try {
    await saveToPhone({ ...j, lrc: await loadLrc(j) }, { file: fileUrl(j, links, 'file', true), cover: fileUrl(j, links, 'cover') }, (p) => say(j.id, p))
    say(j.id, 'saved')
    return true
  } catch (err) {
    say(j.id, String(err?.message || err))
    return false
  }
}

/**
 * In the app, songs that finish while it is open go straight into Music/SheroFetch, one at a time,
 * so Poweramp has them without a tap. Songs this phone fetched itself are already there.
 */
export function useAutoSave(jobs, links) {
  const busy = useRef(false)
  const tried = useRef(new Set())
  useEffect(() => {
    if (!isNative || !autoSaveOn() || busy.current) return
    const start = Date.now()
    ;(async () => {
      busy.current = true
      try {
        const there = await phoneIndex()
        const todo = jobs.filter((j) => j.status === 'done' && j.kind === 'track' && !tried.current.has(j.id) && !savedPath(j.id)
          && !there.get(audioName(j.result || {})) && fileUrl(j, links) && Date.now() - new Date(j.finished_at || 0) < 7 * 864e5)
        for (const j of todo) {
          if (!autoSaveOn() || Date.now() - start > 30 * 60e3) break
          tried.current.add(j.id)
          await saveOne(j, links)
        }
      } finally { busy.current = false }
    })()
  }, [jobs, links])
}

/* ---------------------------------------------------------------- the library */

export function Library({ jobs, state, links, onPlay, playing }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(() => { try { return sessionStorage.getItem('sf-cat') || 'songs' } catch { return 'songs' } })
  const [open, setOpen] = useState(null)
  const [sort, setSort] = useState('recent')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState({})
  const [onPhone, setOnPhone] = useState(() => new Map())
  const [tick, bump] = useState(0)
  const [auto, setAuto] = useState(autoSaveOn)
  const [note, setNote] = useState('')
  const playlists = usePlaylists(jobs)

  useEffect(() => { if (isNative) phoneIndex().then(setOnPhone) }, [tick, picking])
  useEffect(() => {
    const on = (e) => {
      const { id, value } = e.detail
      setSaving((s) => { const n = { ...s }; if (value === 'saved') delete n[id]; else n[id] = value; return n })
      if (value === 'saved') bump((n) => n + 1)
    }
    addEventListener('sf-saving', on)
    return () => removeEventListener('sf-saving', on)
  }, [])

  const done = useMemo(() => jobs.filter((j) => j.status === 'done' && j.kind === 'track'), [jobs])
  const listName = useMemo(() => new Map(playlists.flatMap((p) => p.kids.map((k) => [k.id, p.name]))), [playlists])
  const base = useMemo(() => done.map((j) => ({ j, r: j.result || {}, playlist: listName.get(j.id) || null })), [done, listName])
  const tags = useTags(base)
  const songs = useMemo(() => base.map((s) => {
    const local = isNative ? savedPath(s.j.id) || onPhone.get(audioName(s.r)) || null : null
    return { ...s, tags: tags.get(tagKey(s.r.artist, s.r.track)) || null, local }
  }), [base, tags, onPhone])

  const needle = q.trim().toLowerCase()
  const matches = (s) => !needle || [s.r.track, s.r.artist, s.r.album, s.playlist, s.tags?.genre, s.tags?.mood, s.tags?.language].some((x) => String(x || '').toLowerCase().includes(needle))
  const found = songs.filter(matches)
  const groups = cat === 'songs' ? [] : group(cat, found)
  const openGroup = open && cat !== 'songs' ? groups.find((g) => g.name === open) : null
  const shown = (openGroup ? openGroup.list : cat === 'songs' ? found : []).slice().sort(SORTS[sort][1])
  // While typing, the groups whose own name matches come first, the way a player's search does.
  const nameHits = needle ? ['artists', 'albums', 'playlists', 'genres'].flatMap((c) => group(c, songs).filter((g) => g.name.toLowerCase().includes(needle) && g.name !== 'Not tagged yet').slice(0, 4).map((g) => ({ ...g, cat: c }))) : []

  const pickCat = (c) => swap(() => { setCat(c); setOpen(null); try { sessionStorage.setItem('sf-cat', c) } catch { /* private mode */ } })
  const openIt = (c, name) => swap(() => { setCat(c); setOpen(name); setQ('') })

  async function saveAll(list) {
    for (const s of list) if (!s.local && fileUrl(s.j, links)) await saveOne(s.j, links)
  }
  async function makeJam(name, list, quiet = false) {
    const paths = list.filter((s) => s.local)
    if (!paths.length) { setNote('Save these songs to the phone first; a playlist can only point at songs that are on it.'); return null }
    try {
      const path = await writeJam(name, paths.map((s) => ({ path: s.local, duration: s.r.duration, artist: s.r.artist, track: s.r.track })))
      if (!quiet) setNote(`Made “${name}” with ${paths.length} ${paths.length === 1 ? 'song' : 'songs'}. Poweramp lists it under Playlists.`)
      return path
    } catch (e) { setNote(`Could not write the playlist: ${e?.message || e}`); return null }
  }

  if (state === 'loading') return <p className="muted">Loading your library…</p>
  if (picking) return <SavePicker done={done} playlists={playlists} links={links} onClose={() => { setPicking(false); bump((n) => n + 1) }} />
  const onPhoneCount = songs.filter((s) => s.local).length

  return (
    <section className="lib" aria-labelledby="lib-title">
      <div className="lib__head">
        <div>
          <h1 id="lib-title">{done.length ? 'Your library' : 'No songs yet'}</h1>
          {done.length > 0 && <p className="muted small">{done.length} {done.length === 1 ? 'song' : 'songs'}{isNative ? `, ${onPhoneCount} on this phone` : ''}</p>}
        </div>
        {done.length > 0 && <button className="btn btn--primary" type="button" onClick={() => setPicking(true)}>{isNative ? 'Save to phone' : 'Save to PC'}</button>}
      </div>

      {done.length > 0 && (
        <div className="lib__tools">
          <label className="lib__search">
            <span className="visually-hidden">Search songs, artists, albums, genres and moods</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input className="field" type="search" placeholder="Search songs, artists, genres, moods" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <nav className="lib__cats" aria-label="Browse by">
            {CATS.map(([id, label]) => {
              const n = id === 'songs' ? found.length : group(id, found).filter((g) => g.name !== 'Not tagged yet').length
              return <button key={id} type="button" aria-pressed={cat === id && !openGroup} aria-current={cat === id ? 'true' : undefined} onClick={() => pickCat(id)}>{label}<span>{n}</span></button>
            })}
          </nav>
          {isNative && (
            <label className="autosave">
              <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoSave(e.target.checked) }} />
              <span>Save new songs to this phone automatically</span>
            </label>
          )}
        </div>
      )}

      {!done.length && <p className="muted">Fetched songs land here, ready to save to your phone or PC.</p>}
      {note && <p className="note" role="status">{note} <button className="link" type="button" onClick={() => setNote('')}>OK</button></p>}

      {nameHits.length > 0 && cat === 'songs' && (
        <div className="tiles tiles--hits" aria-label="Matching groups">
          {nameHits.map((g) => <Tile key={`${g.cat}|${g.name}`} g={g} kind={ONE[g.cat]} q={needle} links={links} onOpen={() => openIt(g.cat, g.name)} />)}
        </div>
      )}

      <div className="lib__view" key={`${cat}|${open || ''}`}>
        {openGroup ? (
          <div className="lib__group">
            <button className="btn btn--ghost lib__back" type="button" onClick={() => swap(() => setOpen(null))}>← All {CATS.find((c) => c[0] === cat)[1].toLowerCase()}</button>
            <div className="lib__grouphead">
              <Mosaic list={openGroup.list} links={links} big />
              <div>
                <p className="muted small">{cap(ONE[cat])}</p>
                <h2>{openGroup.name}</h2>
                <p className="muted small">{openGroup.list.length} {openGroup.list.length === 1 ? 'song' : 'songs'}, {fmtTime(openGroup.list.reduce((a, s) => a + (s.r.duration || 0), 0))}</p>
                <div className="lib__groupacts">
                  {isNative && openGroup.list.some((s) => !s.local) && <button className="btn btn--primary" type="button" onClick={() => saveAll(openGroup.list)}>Save all to phone</button>}
                  {isNative && <button className="btn" type="button" onClick={async () => { const p = await makeJam(openGroup.name, openGroup.list); if (p) openInPlayer(p).catch(() => {}) }}>Make a Poweramp playlist</button>}
                  {!isNative && <button className="btn btn--primary" type="button" onClick={() => setPicking(true)}>Save to PC</button>}
                </div>
              </div>
            </div>
          </div>
        ) : cat !== 'songs' ? (
          <>
            {cat === 'playlists' && <Jams songs={songs} playlists={groups} makeJam={makeJam} done={(n) => setNote(n ? `Made ${n} ${n === 1 ? 'playlist' : 'playlists'} in Music/SheroFetch/Playlists. Poweramp lists them under Playlists.` : 'No playlists made: save some songs to the phone first.')} />}
            {groups.length ? (
              <div className="tiles">
                {groups.map((g) => <Tile key={g.name} g={g} kind={ONE[cat]} q={needle} links={links} onOpen={() => openIt(cat, g.name)} />)}
              </div>
            ) : <p className="muted">{needle ? 'Nothing matches that.' : 'Nothing here yet.'}</p>}
            {['genres', 'moods', 'languages'].includes(cat) && songs.some((s) => !s.tags?.mood) && <p className="muted small">Moods and languages come from Gemini. Genres come from iTunes until then.</p>}
          </>
        ) : null}

        {(cat === 'songs' || openGroup) && (
          <>
            <div className="lib__sort">
              <span className="muted small">{shown.length} {shown.length === 1 ? 'song' : 'songs'}</span>
              <label className="small">Sort by{' '}
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
            </div>
            {needle && !shown.length && <p className="muted">No song matches “{q.trim()}”.</p>}
            <ol className="rows rows--lib">
              {shown.map((s) => <SongRow key={s.j.id} s={s} q={needle} links={links} saving={saving[s.j.id]} playing={playing?.id === s.j.id}
                onPlay={onPlay} onSave={() => saveOne(s.j, links)} />)}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}

function Mosaic({ list, links, big }) {
  const four = list.slice(0, 4)
  return (
    <span className={`mosaic mosaic--${Math.min(four.length, 4) >= 4 ? 4 : 1}${big ? ' mosaic--big' : ''}`} aria-hidden="true">
      {(four.length >= 4 ? four : four.slice(0, 1)).map((s) => <Cover key={s.j.id} remote={thumbUrl(s.j, links)} path={s.local} size={big ? 160 : 120} />)}
    </span>
  )
}

function Tile({ g, kind, q, links, onOpen }) {
  return (
    <button className="tile" type="button" onClick={onOpen} aria-label={`${g.name}, ${kind}, ${g.list.length} songs`}>
      <Mosaic list={g.list} links={links} />
      <b><Hl text={g.name} q={q} /></b>
      <span>{g.list.length} {g.list.length === 1 ? 'song' : 'songs'}</span>
    </button>
  )
}

function SongRow({ s, q, links, saving, playing, onPlay, onSave }) {
  const { j, r, local, tags } = s
  const remote = fileUrl(j, links)
  const src = local ? localSrc(local) : remote
  const busy = typeof saving === 'number'
  // Second line, as music apps write it: artist, then the genre and the file type.
  const extra = [tags?.genre, r.ext?.toUpperCase()].filter(Boolean).join(', ')
  return (
    <li className={`row row--song${playing ? ' is-playing' : ''}${local ? ' is-local' : ''}`}>
      <button className="row__cover" type="button" disabled={!src} aria-label={`Check ${r.track}`} title="Play it to check it is the right song" onClick={() => onPlay(local ? { ...j, localSrc: src, localPath: local } : j)}>
        <Cover remote={thumbUrl(j, links)} path={local} />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
      </button>
      <div className="row__main">
        <b><Hl text={r.track} q={q} /></b>
        <span><Hl text={r.artist} q={q} />{extra && <em>, {extra}</em>}</span>
        {busy && <progress max="100" value={Math.round(saving * 100)} aria-label={`Saving, ${Math.round(saving * 100)} percent`} />}
        {typeof saving === 'string' && <span role="alert" className="err">Could not save: {saving}</span>}
        {!src && <span className="muted small">The {machineName(j.worker_id)} holding it is asleep</span>}
      </div>
      {isNative
        ? local
          ? <button className="pill pill--open" type="button" onClick={() => openInPlayer(local).catch(() => {})}>Open</button>
          : <button className="pill pill--save" type="button" disabled={!remote || busy} onClick={onSave}>{busy ? `${Math.round(saving * 100)}%` : 'Save'}</button>
        : <a className={`pill pill--save${src ? '' : ' is-off'}`} aria-disabled={!src} href={src ? fileUrl(j, links, 'file', true) : undefined}>Download</a>}
      <details className="more">
        <summary className="iconbtn" aria-label={`More for ${r.track}`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg></summary>
        <div className="more__menu">
          <p className="more__info">{[r.album && !PLACEHOLDER_ALBUMS.includes(r.album) ? r.album : null, tags?.mood && cap(tags.mood), tags?.language, r.size_mb && `${r.size_mb} MB`].filter(Boolean).join(', ')}</p>
          {isNative && local && remote && <button type="button" onClick={onSave}>Save again</button>}
          <button type="button" onClick={() => rpc('forget_job', { p_job: j.id })}>Remove from this list</button>
        </div>
      </details>
    </li>
  )
}

/* ---------------------------------------------------------------- jams for Poweramp */

const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [x[i], x[k]] = [x[k], x[i]] } return x }

/**
 * Playlist files that point at songs already on the phone: nothing is downloaded again. Each
 * fetched playlist, every mood and genre with three songs or more, plus a random jam.
 */
function Jams({ songs, playlists, makeJam, done }) {
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState([])
  const local = songs.filter((s) => s.local)
  if (!isNative) return <p className="note">In the Android app, Shero turns your playlists, moods and genres into playlists Poweramp can open, using the songs already on the phone.</p>
  async function makeAll() {
    setBusy(true)
    const out = []
    const by = (fn) => { const m = new Map(); local.forEach((s) => { const k = fn(s); if (k) (m.get(k) || m.set(k, []).get(k)).push(s) }); return m }
    for (const p of playlists) if (p.name !== 'Single songs') out.push([p.name, p.list])
    for (const [k, list] of by((s) => s.tags?.mood)) if (list.length >= 3) out.push([`Mood - ${cap(k)}`, shuffle(list)])
    for (const [k, list] of by((s) => s.tags?.genre)) if (list.length >= 3) out.push([`Genre - ${k}`, list])
    const fresh = local.filter((s) => Date.now() - new Date(s.j.finished_at || 0) < 7 * 864e5)
    if (fresh.length >= 3) out.push(['Fresh this week', fresh])
    if (local.length >= 3) out.push(['Shero Jam', shuffle(local).slice(0, 40)])
    const ok = []
    for (const [name, list] of out) if (await makeJam(name, list, true)) ok.push([name, list.filter((s) => s.local).length])
    setMade(ok)
    done(ok.length)
    setBusy(false)
  }
  return (
    <div className="jams">
      <div>
        <h2>Jams for Poweramp</h2>
        <p className="muted small">Playlists made from the {local.length} songs already on this phone: your fetched playlists, each mood and genre, songs from this week and a random mix. Nothing downloads again.</p>
      </div>
      <button className="btn btn--primary" type="button" disabled={busy || local.length === 0} aria-busy={busy} onClick={makeAll}>{busy ? 'Making…' : made.length ? 'Make them again' : 'Make jams'}</button>
      {made.length > 0 && <ul className="jams__made">{made.map(([n, c]) => <li key={n}>{n} <span className="muted">{c}</span></li>)}</ul>}
    </div>
  )
}
