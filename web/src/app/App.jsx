import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, rpc, emailFor, explainAuthError } from '../lib/supabase.js'
import { hasBackend, FORMATS, savedFormat, saveFormat, PLAYLIST_RE } from '../lib/config.js'
import { crayonize } from '../lib/covers.js'
import { useSession, useJobs, useMachineLinks, fileUrl, machineName, fmtTime, parseLrc } from './data.js'

const TABS = [['fetch', 'Fetch'], ['queue', 'Queue'], ['library', 'Library']]

export function App() {
  const { session, profile } = useSession()
  if (!hasBackend) return <Center><p>This copy of SheroFetch is not connected to its server yet.</p></Center>
  if (session === undefined) return <Center><p className="muted">Opening Shero’s kennel…</p></Center>
  if (!session) return <Auth />
  if (!profile) return <Center><p className="muted">Loading your account…</p></Center>
  if (profile.disabled) return <Center><p>Your account is paused. Ask the owner to switch it back on.</p><SignOut /></Center>
  if (profile.role === 'worker') return <Center><p>This is a machine account; it cannot use the app.</p><SignOut /></Center>
  return <Shell profile={profile} />
}

function Center({ children }) {
  return <main className="center"><a className="wordmark" href="/">SheroFetch</a>{children}</main>
}

function SignOut() {
  return <button className="btn btn--quiet" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
}

/* ------------------------------------------------------------------ sign in and join */

function Auth() {
  const [mode, setMode] = useState(location.hash === '#join' ? 'join' : 'signin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ username: '', password: '', code: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setMsg('')
    const username = form.username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setMsg('Usernames are 3 to 20 letters, digits or underscores.')
    if (form.password.length < 8) return setMsg('Passwords need at least 8 characters.')
    setBusy(true)
    try {
      if (mode === 'join') {
        const code = form.code.trim().toLowerCase()
        if (!(await rpc('check_invite', { p_code: code }))) throw new Error('invite_invalid')
        if (!(await rpc('username_free', { p_name: username }))) throw new Error('already registered')
        const { error } = await supabase.auth.signUp({ email: emailFor(username), password: form.password, options: { data: { username, invite_code: code } } })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password: form.password })
        if (error) throw error
      }
    } catch (err) {
      setMsg(explainAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <a className="wordmark" href="/">SheroFetch</a>
      <h1>{mode === 'join' ? 'Join with your invite' : 'Welcome back'}</h1>
      <div className="seg" role="tablist" aria-label="Sign in or join">
        <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => { setMode('signin'); setMsg('') }}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'join'} onClick={() => { setMode('join'); setMsg('') }}>I have an invite</button>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'join' && (
          <label className="lbl">Invite code
            <input className="field" name="code" autoComplete="off" spellCheck="false" value={form.code} onChange={set('code')} placeholder="shero-xxxxx-xxxxx" required />
          </label>
        )}
        <label className="lbl">Username
          <input className="field" name="username" autoComplete="username" spellCheck="false" value={form.username} onChange={set('username')} required />
        </label>
        <label className="lbl">Password
          <input className="field" name="password" type="password" autoComplete={mode === 'join' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required />
        </label>
        <p className="help" role="alert">{msg}</p>
        <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'One moment…' : mode === 'join' ? 'Create my account' : 'Sign in'}</button>
      </form>
      <p className="muted small">No email needed. If you forget your password, the owner can reset it.</p>
    </main>
  )
}

/* ------------------------------------------------------------------ the shell */

function Shell({ profile }) {
  const [tab, setTab] = useState(() => (['queue', 'library'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'fetch'))
  const { jobs, state } = useJobs(profile.id)
  const links = useMachineLinks()
  const [playing, setPlaying] = useState(null)
  const go = (t) => { setTab(t); history.replaceState(null, '', `#${t}`) }
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length

  return (
    <div className="shell">
      <header className="bar">
        <a className="wordmark" href="/">SheroFetch</a>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
              {label}{id === 'queue' && running > 0 && <span className="count">{running}</span>}
            </button>
          ))}
        </nav>
        <div className="who">
          {profile.role === 'owner' && <a className="link" href="/control">Control Room</a>}
          <span className="muted">{profile.username}</span>
          <SignOut />
        </div>
      </header>
      <main className={`view view--${tab}`}>
        {tab === 'fetch' && <Fetch profile={profile} onQueued={() => go('queue')} />}
        {tab === 'queue' && <Queue jobs={jobs} state={state} />}
        {tab === 'library' && <Library jobs={jobs} state={state} links={links} onPlay={setPlaying} playing={playing} />}
      </main>
      {playing && <Player job={playing} links={links} onClose={() => setPlaying(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ fetch */

function Fetch({ profile, onQueued }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [covers, setCovers] = useState({})
  const [format, setFormat] = useState(savedFormat())
  const [target, setTarget] = useState('any')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const isLink = PLAYLIST_RE.test(q.trim())

  async function queue(payload) {
    setBusy(true)
    setMsg('')
    const row = { query: payload.query, artist: payload.artist || null, title: payload.title || null, album: payload.album || null, duration: payload.duration || null,
      url: payload.url || null, kind: payload.url && !/\/track\/|watch\?v=|youtu\.be\//.test(payload.url) ? 'playlist' : 'track',
      format: payload.format || format, target: profile.role === 'owner' ? target : 'any' }
    if (row.url && row.kind === 'track') row.query = row.url
    const { error } = await supabase.from('jobs').insert(row)
    setBusy(false)
    if (error) {
      setMsg(/row-level security/i.test(error.message) ? 'You have hit today’s limit of songs. More tomorrow.' : error.message)
      return false
    }
    onQueued()
    return true
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    let pending = params.get('fetch')
    if (!pending) { try { pending = sessionStorage.getItem('sf-pending') } catch { /* private mode */ } }
    if (!pending) return
    try { sessionStorage.removeItem('sf-pending') } catch { /* private mode */ }
    history.replaceState(null, '', location.pathname + location.hash)
    try { queue(JSON.parse(pending)) } catch { /* ignore a bad link */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2 || isLink) { setResults([]); return }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const data = await (await fetch(`/api/search?v=3&q=${encodeURIComponent(term)}`)).json()
        if (mine !== seq.current) return
        setResults(data.results || [])
        setMsg(data.error || ((data.results || []).length ? '' : 'No match. Check the spelling, or add the artist.'))
        ;(data.results || []).forEach((r, i) => crayonize(r.art, i + 1).then((src) => setCovers((c) => ({ ...c, [r.art]: src }))))
      } catch { setMsg('Search is not answering right now.') }
    }, 280)
    return () => clearTimeout(t)
  }, [q, isLink])

  return (
    <section className="fetchview" aria-labelledby="fetch-title">
      <h1 id="fetch-title">What should Shero fetch?</h1>
      <form className="searchrow" role="search" onSubmit={(e) => { e.preventDefault(); if (isLink) queue({ query: q.trim(), url: q.trim() }); else if (results[0]) queue({ query: `${results[0].artist} - ${results[0].title}`, ...results[0] }) }}>
        <label className="visually-hidden" htmlFor="appq">Song, artist or playlist link</label>
        <input id="appq" className="field" type="search" autoComplete="off" spellCheck="false" placeholder="Song, artist, or a Spotify or YouTube link" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn--primary" type="submit" disabled={busy || (!isLink && !results.length)}>{isLink ? 'Fetch every song' : 'Shero, gaana le aa!'}</button>
      </form>
      <div className="options">
        <fieldset className="seg">
          <legend>Format</legend>
          {Object.keys(FORMATS).map((f) => (
            <label key={f}><input type="radio" name="format" value={f} checked={format === f} onChange={() => { setFormat(f); saveFormat(f) }} /><span>{f.toUpperCase()}</span></label>
          ))}
        </fieldset>
        {profile.role === 'owner' && (
          <fieldset className="seg">
            <legend>Fetch on</legend>
            {[['any', 'Whichever is awake'], ['phone', 'Phone'], ['pc', 'PC']].map(([v, l]) => (
              <label key={v}><input type="radio" name="target" value={v} checked={target === v} onChange={() => setTarget(v)} /><span>{l}</span></label>
            ))}
          </fieldset>
        )}
      </div>
      <p className="help" aria-live="polite">{isLink ? 'A link. Shero will fetch every song in it, up to 30 for members.' : msg || FORMATS[format].note}</p>
      {results.length > 0 && (
        <ul className="hits">
          {results.map((r) => (
            <li key={`${r.artist}|${r.title}`}>
              <img src={covers[r.art] || ''} alt="" width="56" height="56" />
              <div><b>{r.title}</b><span>{r.artist}{r.album ? `, ${r.album}` : ''}</span></div>
              <time>{fmtTime(r.duration)}</time>
              <button className="btn btn--quiet" type="button" disabled={busy} onClick={() => queue({ query: `${r.artist} - ${r.title}`, ...r })}>Fetch</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ queue */

const STATUS = { queued: 'Waiting for a machine', running: 'Fetching', failed: 'Could not fetch', cancelled: 'Cancelled', done: 'Ready' }

function Queue({ jobs, state }) {
  const open = jobs.filter((j) => j.kind === 'track' && (j.status === 'queued' || j.status === 'running'))
  const trouble = jobs.filter((j) => j.kind === 'track' && (j.status === 'failed' || j.status === 'cancelled')).slice(0, 20)
  const lists = jobs.filter((j) => j.kind === 'playlist' && (j.status !== 'done' || Date.now() - new Date(j.finished_at) < 3600e3))
  if (state === 'loading') return <p className="muted">Loading your queue…</p>
  if (state === 'error') return <p>Could not load your queue. Check your connection and reload.</p>
  return (
    <section aria-labelledby="queue-title">
      <h1 id="queue-title">{open.length ? `Shero has ${open.length} ${open.length === 1 ? 'song' : 'songs'} to fetch` : 'Nothing waiting'}</h1>
      {!open.length && !trouble.length && <p className="muted">Songs you ask for show up here until they are ready.</p>}
      {lists.map((j) => (
        <p key={j.id} className="note">Playlist {j.status === 'done' ? `added ${j.result?.tracks ?? 0} songs` : j.status === 'failed' ? `failed: ${j.error}` : 'is being read'}: {j.query}</p>
      ))}
      <ol className="rows">
        {open.map((j) => <JobRow key={j.id} job={j} />)}
      </ol>
      {trouble.length > 0 && <>
        <h2 className="sub">Did not make it</h2>
        <ol className="rows">{trouble.map((j) => <JobRow key={j.id} job={j} />)}</ol>
      </>}
    </section>
  )
}

function JobRow({ job }) {
  const pct = Math.round((job.progress || 0) * 100)
  return (
    <li className={`row row--${job.status}`}>
      <div className="row__main">
        <b>{job.title || job.query}</b>
        <span>{job.artist || ''}</span>
      </div>
      <div className="row__state">
        <span>{job.status === 'running' ? `${job.stage || 'Fetching'} on the ${machineName(job.worker_id)}` : job.status === 'failed' ? job.error : STATUS[job.status]}</span>
        {job.status === 'running' && <progress max="100" value={pct} aria-label={`${pct} percent`} />}
      </div>
      <span className="fmt">{job.format.toUpperCase()}</span>
      {(job.status === 'queued' || job.status === 'running') && <button className="btn btn--quiet" type="button" onClick={() => rpc('cancel_job', { p_job: job.id })}>Cancel</button>}
      {(job.status === 'failed' || job.status === 'cancelled') && <button className="btn btn--quiet" type="button" onClick={() => rpc('retry_job', { p_job: job.id })}>Try again</button>}
    </li>
  )
}

/* ------------------------------------------------------------------ library */

function Library({ jobs, state, links, onPlay, playing }) {
  const [filter, setFilter] = useState('')
  const done = useMemo(() => jobs.filter((j) => j.status === 'done' && j.kind === 'track'), [jobs])
  const shown = done.filter((j) => `${j.result?.track} ${j.result?.artist} ${j.result?.album}`.toLowerCase().includes(filter.toLowerCase()))
  if (state === 'loading') return <p className="muted">Loading your library…</p>
  return (
    <section aria-labelledby="lib-title">
      <div className="libhead">
        <h1 id="lib-title">{done.length ? `${done.length} ${done.length === 1 ? 'song' : 'songs'} fetched` : 'No songs yet'}</h1>
        {done.length > 4 && <input className="field field--small" type="search" placeholder="Filter" aria-label="Filter your songs" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      </div>
      {!done.length && <p className="muted">Fetched songs land here, ready to play or save.</p>}
      <ol className="rows">
        {shown.map((j) => {
          const src = fileUrl(j, links)
          const cover = fileUrl(j, links, 'cover')
          const r = j.result || {}
          return (
            <li key={j.id} className={`row row--done${playing?.id === j.id ? ' is-playing' : ''}`}>
              {cover ? <img className="cover" src={cover} alt="" width="48" height="48" loading="lazy" /> : <span className="cover cover--none" aria-hidden="true" />}
              <div className="row__main"><b>{r.track}</b><span>{r.artist}{r.album ? `, ${r.album}` : ''}</span></div>
              <div className="row__state">
                <span>{r.ext?.toUpperCase()} {r.size_mb ? `${r.size_mb} MB` : ''}{r.ext === 'flac' && !r.lossless_source ? ', converted' : ''}</span>
                {!src && <span className="muted">The {machineName(j.worker_id)} holding it is asleep</span>}
              </div>
              <button className="btn btn--quiet" type="button" disabled={!src} onClick={() => onPlay(j)}>Play</button>
              <a className={`btn btn--quiet${src ? '' : ' is-off'}`} aria-disabled={!src} href={src ? fileUrl(j, links, 'file', true) : undefined}>Save</a>
              <button className="btn btn--ghost" type="button" aria-label={`Remove ${r.track} from this list`} onClick={() => rpc('forget_job', { p_job: j.id })}>Remove</button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ player and lyrics */

function Player({ job, links, onClose }) {
  const audio = useRef(null)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [paused, setPaused] = useState(true)
  const [showLyrics, setShowLyrics] = useState(Boolean(job.lrc))
  const lines = useMemo(() => parseLrc(job.lrc), [job.lrc])
  const current = lines.findLastIndex ? lines.findLastIndex((l) => l.t <= t + 0.25) : -1
  const lyricsRef = useRef(null)
  const src = fileUrl(job, links)

  useEffect(() => { audio.current?.play().catch(() => {}) }, [job.id])
  useEffect(() => {
    const el = lyricsRef.current?.querySelector('[aria-current="true"]')
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [current])

  return (
    <aside className="player" aria-label="Player">
      {showLyrics && lines.length > 0 && (
        <div className="lyrics" ref={lyricsRef}>
          {lines.map((l, i) => <p key={i} aria-current={i === current} onClick={() => { audio.current.currentTime = l.t }}>{l.text || '\u00a0'}</p>)}
        </div>
      )}
      <div className="player__bar">
        <button className="btn btn--primary btn--round" type="button" aria-label={paused ? 'Play' : 'Pause'} onClick={() => (paused ? audio.current.play() : audio.current.pause())}>{paused ? 'Play' : 'Pause'}</button>
        <div className="player__info"><b>{job.result?.track}</b><span>{job.result?.artist}</span></div>
        <time>{fmtTime(t)}</time>
        <input className="seek" type="range" min="0" max={dur || 1} step="0.1" value={t} aria-label="Position" onChange={(e) => { audio.current.currentTime = Number(e.target.value) }} />
        <time>{fmtTime(dur)}</time>
        {lines.length > 0 && <button className="btn btn--quiet" type="button" aria-pressed={showLyrics} onClick={() => setShowLyrics(!showLyrics)}>Lyrics</button>}
        <button className="btn btn--ghost" type="button" onClick={onClose}>Close</button>
      </div>
      {src ? (
        <audio ref={audio} src={src} preload="metadata" onTimeUpdate={(e) => setT(e.target.currentTime)} onLoadedMetadata={(e) => setDur(e.target.duration)}
          onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => setPaused(true)} />
      ) : <p className="help">The machine holding this song just went to sleep.</p>}
    </aside>
  )
}
