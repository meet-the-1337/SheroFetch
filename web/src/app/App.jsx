import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, rpc, emailFor, explainAuthError } from '../lib/supabase.js'
import { hasBackend, FORMATS, savedFormat, saveFormat, PLAYLIST_RE } from '../lib/config.js'
import { crayonize } from '../lib/covers.js'
import { useSession, useJobs, useMachineLinks, useOnline, fileUrl, thumbUrl, machineName, fmtTime, parseLrc, loadLrc, explainFailure } from './data.js'
import { usePlaylists, PlaylistCard, FailHelp, SavePicker } from './lists.jsx'
import { Devices, DeviceChoice, deviceChoiceMade, useMyDevices } from './devices.jsx'
import { THEMES, getTheme, setTheme } from '../lib/theme.js'
import { isNative, apiUrl, siteUrl, saveToPhone, savedPath, localSrc, phoneSongs, phoneIndex, audioName, readLocalText, outbox, setOutbox, addToOutbox, mirrorMedia, localArt } from '../lib/native.js'

const TABS = [['fetch', 'Fetch'], ['queue', 'Queue'], ['library', 'Library'], ['devices', 'Devices']]

export function App() {
  const online = useOnline()
  const { session, profile, profileError, cachedProfile } = useSession(online)
  const [localOnly, setLocalOnly] = useState(false)
  if (!hasBackend) return <Center><p>This copy of SheroFetch is not connected to its server yet.</p></Center>
  if (session === undefined) return <Center><p className="muted">Opening Shero’s kennel…</p></Center>
  // In the Android app nothing here needs a signal: with no connection, or no answer from the
  // server, it opens on the songs already on the phone and keeps new requests until it is back.
  if (isNative && !session && localOnly) return <Offline profile={null} signedIn={false} onBack={() => setLocalOnly(false)} />
  if (isNative && (!online || profileError)) return <Offline profile={profile || cachedProfile()} signedIn={Boolean(session)} />
  if (!session) return <Auth onPhoneSongs={isNative ? () => setLocalOnly(true) : null} />
  if (profileError) return <Center><p>Cannot reach Shero’s server right now. Check your connection and reload.</p></Center>
  if (!profile) return <Center><p className="muted">Loading your account…</p></Center>
  if (profile.disabled) return <Center><p>Your account is paused. Ask the owner to switch it back on.</p><SignOut /></Center>
  if (profile.role === 'worker') return <Center><p>This is a machine account; it cannot use the app.</p><SignOut /></Center>
  return <Shell profile={profile} />
}

// Album names the resolver or tagger uses when the real album is not known.
const PLACEHOLDER_ALBUMS = ['Unknown Album', 'SheroFetch', 'Official Studio Release']

function Center({ children }) {
  return <main className="center"><a className="wordmark" href={siteUrl('/')}>SheroFetch</a>{children}</main>
}

function LookSwitch() {
  const [t, setT] = useState(getTheme)
  useEffect(() => { const on = (e) => setT(e.detail); addEventListener('sf-theme', on); return () => removeEventListener('sf-theme', on) }, [])
  return (
    <div className="looks" role="group" aria-label="Site look">
      {THEMES.map((x) => <button key={x.id} type="button" aria-pressed={t === x.id} onClick={() => setTheme(x.id)}>{x.label}</button>)}
    </div>
  )
}

function SignOut() {
  return <button className="btn btn--quiet" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
}

/* ------------------------------------------------------------------ sign in and join */

function Auth({ onPhoneSongs }) {
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
      <a className="wordmark" href={siteUrl('/')}>SheroFetch</a>
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
      {onPhoneSongs && <button className="btn btn--ghost" type="button" onClick={onPhoneSongs}>Play songs already on this phone</button>}
    </main>
  )
}

/* ------------------------------------------------------------------ the shell */

function Shell({ profile }) {
  const [tab, setTab] = useState(() => (['queue', 'library', 'devices'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'fetch'))
  const { jobs, state } = useJobs(profile.id)
  const links = useMachineLinks()
  const [playing, setPlaying] = useState(null)
  // Each tab is a history step, so the phone's back button returns to the previous tab before
  // it leaves the app.
  const go = (t) => { if (t !== tab) history.pushState(null, '', `#${t}`); setTab(t); scrollTo({ top: 0 }) }
  useEffect(() => {
    const back = () => { const h = location.hash.slice(1); setTab(['queue', 'library', 'devices'].includes(h) ? h : 'fetch'); scrollTo({ top: 0 }) }
    addEventListener('popstate', back)
    return () => removeEventListener('popstate', back)
  }, [])
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length
  const [held, setHeld] = useState(() => outbox().length)
  // "Mil gaya!" toast whenever one of my songs finishes while the app is open.
  const [toasts, setToasts] = useState([])
  const seen = useRef(null)
  useEffect(() => {
    const now = new Map(jobs.map((j) => [j.id, j.status]))
    if (seen.current) {
      for (const j of jobs) {
        if (j.kind === 'track' && j.status === 'done' && seen.current.get(j.id) && seen.current.get(j.id) !== 'done') {
          const id = `${j.id}-${Date.now()}`
          setToasts((t) => [...t.slice(-2), { id, text: `Mil gaya! ${j.result?.track || j.title || ''}` }])
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600)
        }
      }
    }
    seen.current = now
  }, [jobs])

  // Requests made with no signal go into the queue as soon as the server answers again.
  useEffect(() => {
    let stop = false
    async function flush() {
      const rows = outbox()
      if (!rows.length) return
      const left = []
      for (const { _at, ...row } of rows) {
        if (stop) { left.push({ ...row, _at }); continue }
        const { error } = await supabase.from('jobs').insert(row)
        if (error && /fetch|network|failed/i.test(error.message)) left.push({ ...row, _at })
      }
      setOutbox(left)
      setHeld(left.length)
    }
    flush()
    addEventListener('online', flush)
    return () => { stop = true; removeEventListener('online', flush) }
  }, [])

  return (
    <div className="shell">
      <header className="bar">
        <a className="wordmark" href={siteUrl('/')}>SheroFetch</a>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
              {label}{id === 'queue' && running > 0 && <span key={running} className="count">{running}</span>}
            </button>
          ))}
        </nav>
        <div className="who">
          <LookSwitch />
          {profile.role === 'owner' && <a className="link" href={siteUrl('/control')}>Control Room</a>}
          <span className="muted">{profile.username}</span>
          <SignOut />
        </div>
      </header>
      <main key={tab} className={`view view--${tab}`}>
        {tab === 'fetch' && <Fetch profile={profile} onQueued={() => go('queue')} onSetup={() => go('devices')} />}
        {tab === 'devices' && <Devices />}
        {tab === 'queue' && <Queue jobs={jobs} state={state} held={held} />}
        {tab === 'library' && <Library jobs={jobs} state={state} links={links} onPlay={setPlaying} playing={playing} />}
      </main>
      {playing && <Player job={playing} links={links} onClose={() => setPlaying(null)} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <p key={t.id} className="toast">{t.text}</p>)}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ fetch */

function Fetch({ profile, onQueued, onSetup }) {
  const devices = useMyDevices()
  const [asked, setAsked] = useState(deviceChoiceMade)
  const mineOnline = devices?.some((d) => d.online)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [covers, setCovers] = useState({})
  const [format, setFormat] = useState(savedFormat())
  const [target, setTarget] = useState(() => { try { return localStorage.getItem('sf-target') || 'any' } catch { return 'any' } })
  const pickTarget = (v) => { setTarget(v); try { localStorage.setItem('sf-target', v) } catch { /* storage off */ } }
  const hasDevice = devices?.length > 0
  const sendTo = target === 'mine' && hasDevice ? 'mine' : profile.role === 'owner' && ['pc', 'phone'].includes(target) ? target : 'any'
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const isLink = PLAYLIST_RE.test(q.trim())

  async function queue(payload) {
    setBusy(true)
    setMsg('')
    const row = { query: payload.query, artist: payload.artist || null, title: payload.title || null, album: payload.album || null, duration: payload.duration || null,
      url: payload.url || null, kind: payload.url && !/\/track\/|watch\?v=|youtu\.be\//.test(payload.url) ? 'playlist' : 'track',
      format: payload.format || format, target: sendTo }
    if (row.url && row.kind === 'track') row.query = row.url
    const { error } = await supabase.from('jobs').insert(row)
    setBusy(false)
    if (error && isNative && /fetch|network|failed/i.test(error.message)) {
      addToOutbox(row)
      setMsg('No signal. Shero will ask for this song as soon as the phone is back online.')
      return false
    }
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
        const data = await (await fetch(apiUrl(`/api/search?v=3&q=${encodeURIComponent(term)}`))).json()
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
      {!asked && profile.role !== 'owner' && devices?.length === 0 && <DeviceChoice onSetup={onSetup} onDone={() => setAsked(true)} />}
      <form className="searchrow" role="search" onSubmit={(e) => { e.preventDefault(); if (isLink) queue({ query: q.trim(), url: q.trim() }); else if (results[0]) queue({ query: `${results[0].artist} - ${results[0].title}`, ...results[0] }) }}>
        <label className="visually-hidden" htmlFor="appq">Song, artist or playlist link</label>
        <input id="appq" className="field" type="search" autoComplete="off" spellCheck="false" placeholder="Song, artist, or a Spotify or YouTube link" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn--primary" type="submit" disabled={busy || (!isLink && !results.length)}>{isLink ? 'Fetch every song' : 'Shero, gaana le aa!'}</button>
      </form>
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
      <div className="options">
        <fieldset className="seg">
          <legend>Format</legend>
          {Object.keys(FORMATS).map((f) => (
            <label key={f}><input type="radio" name="format" value={f} checked={format === f} onChange={() => { setFormat(f); saveFormat(f) }} /><span>{f.toUpperCase()}</span></label>
          ))}
        </fieldset>
        {(profile.role === 'owner' || hasDevice) && (
          <fieldset className="seg">
            <legend>Fetch on</legend>
            {[...(profile.role === 'owner' ? [['any', 'Whichever is awake'], ['phone', 'Phone'], ['pc', 'PC']] : [['any', 'SheroFetch machines']]), ...(hasDevice ? [['mine', 'My device']] : [])].map(([v, l]) => (
              <label key={v}><input type="radio" name="target" value={v} checked={sendTo === v} onChange={() => pickTarget(v)} /><span>{l}</span></label>
            ))}
          </fieldset>
        )}
        {!hasDevice && devices && profile.role !== 'owner' && <button className="link" type="button" onClick={onSetup}>Fetch on my own device instead</button>}
      </div>
      <p className="help" aria-live="polite">{sendTo === 'mine' && !mineOnline ? 'Your device is offline. Songs wait in the queue until it is back.' : isLink ? (sendTo === 'mine' ? 'A link. Your device will fetch every song in it.' : 'A link. Shero fetches as many songs as today’s limit allows; the rest wait for tomorrow.') : msg || FORMATS[format].note}</p>
    </section>
  )
}

/* ------------------------------------------------------------------ queue */

const STATUS = { queued: 'Waiting for a machine', running: 'Fetching', failed: 'Could not fetch', cancelled: 'Cancelled', done: 'Ready' }

function Queue({ jobs, state, held = 0 }) {
  // Songs of a playlist live on its card; only loose songs are listed on their own.
  const open = jobs.filter((j) => j.kind === 'track' && (j.status === 'queued' || j.status === 'running'))
  const loose = open.filter((j) => !j.parent_id)
  const trouble = jobs.filter((j) => j.kind === 'track' && !j.parent_id && (j.status === 'failed' || j.status === 'cancelled')).slice(0, 30)
  const lists = usePlaylists(jobs).filter(({ parent, kids }) => parent.status !== 'done' || parent.result?.pending?.length
    || kids.some((k) => k.status !== 'done') || Date.now() - new Date(parent.finished_at) < 6 * 3600e3)
  if (state === 'loading') return <p className="muted">Loading your queue…</p>
  if (state === 'error') return <p>Could not load your queue. Check your connection and reload.</p>
  return (
    <section aria-labelledby="queue-title">
      <h1 id="queue-title">{open.length ? `Shero has ${open.length} ${open.length === 1 ? 'song' : 'songs'} to fetch` : 'Nothing waiting'}</h1>
      {held > 0 && <p className="note">{held} {held === 1 ? 'song was' : 'songs were'} asked for with no signal and will join the queue when the phone is back online.</p>}
      {!open.length && !trouble.length && !held && !lists.length && <p className="muted">Songs you ask for show up here until they are ready.</p>}
      {lists.map((pl) => <PlaylistCard key={pl.parent.id} pl={pl} Row={JobRow} />)}
      <ol className="rows">
        {loose.map((j) => <JobRow key={j.id} job={j} />)}
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
  const bad = job.status === 'failed' || job.status === 'cancelled'
  const [help, setHelp] = useState(false)
  return (
    <li className={`row row--${job.status}`}>
      <div className="row__main">
        <b>{job.title || job.query}</b>
        <span>{job.artist || ''}</span>
      </div>
      <div className="row__state">
        <span>{job.status === 'running' ? `${job.stage || 'Fetching'} on the ${machineName(job.worker_id)}` : bad ? explainFailure(job).title : STATUS[job.status]}</span>
        {job.status === 'running' && <progress max="100" value={pct} aria-label={`${pct} percent`} />}
      </div>
      <span className="fmt">{job.format.toUpperCase()}</span>
      {(job.status === 'queued' || job.status === 'running') && <button className="btn btn--quiet" type="button" onClick={() => rpc('cancel_job', { p_job: job.id })}>Cancel</button>}
      {bad && <button className="btn btn--quiet" type="button" aria-expanded={help} onClick={() => setHelp(!help)}>{help ? 'Hide options' : 'Why, and what to try'}</button>}
      {bad && help && <FailHelp job={job} />}
    </li>
  )
}

/* ------------------------------------------------------------------ library */

// Where the file came from, said plainly, so a person can judge the copy they got.
function sourceLabel(r) {
  const s = String(r.source || '').toLowerCase()
  if (s.includes('soulseek') || s.includes('p2p')) return r.ext === 'flac' ? 'From Soulseek, a real lossless rip' : 'From Soulseek, a 320 kbps rip'
  if (s.includes('youtube') || s.includes('yt')) return r.ext === 'flac' ? 'From YouTube, converted to FLAC (not true lossless)' : 'From YouTube'
  return ''
}

function Library({ jobs, state, links, onPlay, playing }) {
  const [filter, setFilter] = useState('')
  const [list, setList] = useState('all')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState({})
  const [onPhone, setOnPhone] = useState(() => new Map())
  const [tick, bump] = useState(0)
  const playlists = usePlaylists(jobs)
  // Songs already in Music/SheroFetch, whether saved here or fetched by this phone as a server.
  useEffect(() => { if (isNative) phoneIndex().then(setOnPhone) }, [tick, picking])
  async function toPhone(j) {
    setSaving((s) => ({ ...s, [j.id]: 0 }))
    try {
      await saveToPhone({ ...j, lrc: await loadLrc(j) }, { file: fileUrl(j, links, 'file', true), cover: fileUrl(j, links, 'cover') }, (p) => setSaving((s) => ({ ...s, [j.id]: p })))
      setSaving((s) => { const n = { ...s }; delete n[j.id]; return n })
      bump((n) => n + 1)
    } catch (err) {
      setSaving((s) => ({ ...s, [j.id]: String(err?.message || err) }))
    }
  }
  const done = useMemo(() => jobs.filter((j) => j.status === 'done' && j.kind === 'track'), [jobs])
  const inList = list === 'all' ? null : list === 'single' ? (j) => !j.parent_id : (j) => j.parent_id === list
  const shown = done.filter((j) => (!inList || inList(j)) && `${j.result?.track} ${j.result?.artist} ${j.result?.album}`.toLowerCase().includes(filter.toLowerCase()))
  const withSongs = playlists.filter((p) => p.kids.some((k) => k.status === 'done'))
  if (state === 'loading') return <p className="muted">Loading your library…</p>
  if (picking) return <SavePicker done={done} playlists={playlists} links={links} onClose={() => { setPicking(false); bump((n) => n + 1) }} />
  return (
    <section aria-labelledby="lib-title">
      <div className="libhead">
        <h1 id="lib-title">{done.length ? `${done.length} ${done.length === 1 ? 'song' : 'songs'} fetched` : 'No songs yet'}</h1>
        {done.length > 4 && <input className="field field--small" type="search" placeholder="Filter" aria-label="Filter your songs" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        {done.length > 0 && <button className="btn btn--primary btn--big" type="button" onClick={() => setPicking(true)}>{isNative ? 'Save to phone' : 'Save to PC'}</button>}
      </div>
      {withSongs.length > 0 && (
        <div className="chips" role="group" aria-label="Show">
          {[['all', 'Everything'], ['single', 'Single songs'], ...withSongs.map((p) => [p.parent.id, `${p.name} (${p.kids.filter((k) => k.status === 'done').length})`])].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={list === id} onClick={() => setList(id)}>{label}</button>
          ))}
        </div>
      )}
      {!done.length && <p className="muted">Fetched songs land here, ready to play or save.</p>}
      <ol className="rows">
        {shown.map((j) => {
          const local = isNative ? savedPath(j.id) || onPhone.get(audioName(j.result || {})) || null : null
          const src = local ? localSrc(local) : fileUrl(j, links)
          const cover = thumbUrl(j, links)
          const r = j.result || {}
          const s = saving[j.id]
          return (
            <li key={j.id} className={`row row--done${playing?.id === j.id ? ' is-playing' : ''}`}>
              <Cover remote={cover} path={local} />
              <div className="row__main"><b>{r.track}</b><span>{r.artist}{r.album && !PLACEHOLDER_ALBUMS.includes(r.album) ? `, ${r.album}` : ''}</span></div>
              <div className="row__state">
                <span>{r.ext?.toUpperCase()} {r.size_mb ? `${r.size_mb} MB` : ''}{r.ext === 'flac' && !r.lossless_source ? ', converted' : ''}</span>
                {!src && <span className="muted">The {machineName(j.worker_id)} holding it is asleep</span>}
                {j.result?.source && <span className="muted small">{sourceLabel(j.result)}</span>}
                {local && <span className="muted">On this phone, in Music/SheroFetch</span>}
                {typeof s === 'number' && <progress max="100" value={Math.round(s * 100)} aria-label={`Saving, ${Math.round(s * 100)} percent`} />}
                {typeof s === 'string' && <span role="alert">Could not save: {s}</span>}
              </div>
              <button className="btn btn--quiet act-play" type="button" disabled={!src} onClick={() => onPlay(local ? { ...j, localSrc: src, localPath: local } : j)}>Play</button>
              {isNative
                ? <button className="btn btn--quiet act-save" type="button" disabled={!fileUrl(j, links) || typeof s === 'number'} onClick={() => toPhone(j)}>{local ? 'Save again' : typeof s === 'number' ? 'Saving…' : 'Save to phone'}</button>
                : <a className={`btn btn--quiet act-save${src ? '' : ' is-off'}`} aria-disabled={!src} href={src ? fileUrl(j, links, 'file', true) : undefined}>Save</a>}
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
  const [lrc, setLrc] = useState(job.lrc ?? null)
  const [showLyrics, setShowLyrics] = useState(true)
  useEffect(() => { let live = true; if (job.lrc !== undefined) setLrc(job.lrc); else loadLrc(job).then((l) => live && setLrc(l)); return () => { live = false } }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => parseLrc(lrc), [lrc])
  const current = lines.findLastIndex ? lines.findLastIndex((l) => l.t <= t + 0.25) : -1
  const lyricsRef = useRef(null)
  const src = job.localSrc || fileUrl(job, links)

  useEffect(() => { audio.current?.play().catch(() => {}) }, [job.id])
  // Lock screen, notification shade and headset buttons.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = audio.current
    if (!el) return undefined
    return mirrorMedia(el, { title: job.result?.track, artist: job.result?.artist, art: job.localPath ? null : thumbUrl(job, links), file: job.localPath }, {
      play: () => el.play().catch(() => {}),
      pause: () => el.pause(),
      stop: () => { el.pause(); closeRef.current() },
      seek: (pos) => { if (Number.isFinite(pos)) el.currentTime = pos },
      next: () => {}, previous: () => { el.currentTime = 0 },
    })
  }, [job.id, src]) // eslint-disable-line react-hooks/exhaustive-deps
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

/** A song's cover: the machine's thumbnail, else the art inside the file on this phone, loaded once in view. */
function Cover({ remote, path }) {
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
  return <img className="cover" src={src} alt="" width="48" height="48" loading="lazy" onError={() => { if (src !== remote || !path) setSrc(null); setFailed(true) }} />
}

/* ------------------------------------------------------------------ the app with no signal */

function Offline({ profile, signedIn, onBack }) {
  const [songs, setSongs] = useState(null)
  const [playing, setPlaying] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [held, setHeld] = useState(() => outbox().length)
  const [find, setFind] = useState('')
  useEffect(() => { phoneSongs().then(setSongs).catch(() => setSongs([])) }, [])

  async function play(song) {
    const lrc = song.lrc ? await readLocalText(song.lrc) : null
    setPlaying({ id: song.path, localSrc: song.src, localPath: song.path, lrc, result: { track: song.track, artist: song.artist } })
  }
  function hold(e) {
    e.preventDefault()
    const term = q.trim()
    if (!term || !signedIn) return
    const [artist, ...rest] = term.split(' - ')
    addToOutbox({ query: term, artist: rest.length ? artist.trim() : null, title: rest.length ? rest.join(' - ').trim() : null, album: null, duration: null,
      url: PLAYLIST_RE.test(term) ? term : null, kind: PLAYLIST_RE.test(term) ? 'playlist' : 'track', format: savedFormat(), target: 'any' })
    setHeld(outbox().length)
    setQ('')
    setMsg('Saved. Shero asks for it the moment the phone is back online.')
  }

  return (
    <div className="shell">
      <header className="bar">
        <span className="wordmark">SheroFetch</span>
        <div className="who"><span className="muted">{profile?.username || ''}</span></div>
      </header>
      <main className="view view--library">
        <section aria-labelledby="off-title">
          <h1 id="off-title">{onBack ? 'Songs on this phone' : 'No signal, so Shero plays what is on this phone'}</h1>
          {onBack ? <p><button className="btn btn--quiet" type="button" onClick={onBack}>Back to sign in</button></p>
            : <p className="muted">The queue and your machines come back by themselves when the connection does.</p>}
          {signedIn && (
            <form className="searchrow" onSubmit={hold}>
              <label className="visually-hidden" htmlFor="offq">Song to fetch later, as Artist - Title, or a playlist link</label>
              <input id="offq" className="field" autoComplete="off" spellCheck="false" placeholder="Artist - Title, fetched once you are online" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn--primary" type="submit" disabled={!q.trim()}>Fetch later</button>
            </form>
          )}
          <p className="help" aria-live="polite">{msg || (held ? `${held} ${held === 1 ? 'song is' : 'songs are'} waiting to be asked for.` : '')}</p>
          {songs === null && <p className="muted">Looking in Music/SheroFetch…</p>}
          {songs?.length === 0 && <p className="muted">No songs saved on this phone yet. Use Save to phone in the library when you are online.</p>}
          {songs?.length > 12 && <input className="field field--small" type="search" placeholder={`Filter ${songs.length} songs`} aria-label="Filter the songs on this phone" value={find} onChange={(e) => setFind(e.target.value)} />}
          <ol className="rows">
            {(songs || []).filter((s) => !find || `${s.track} ${s.artist} ${s.album}`.toLowerCase().includes(find.toLowerCase())).slice(0, 300).map((s) => (
              <li key={s.path} className={`row row--done${playing?.id === s.path ? ' is-playing' : ''}`}>
                <Cover remote={s.art} path={s.path} />
                <div className="row__main"><b>{s.track}</b><span>{[s.artist, s.album && !PLACEHOLDER_ALBUMS.includes(s.album) ? s.album : ''].filter(Boolean).join(', ') || s.ext.toUpperCase()}</span></div>
                <div className="row__state"><span>{s.ext.toUpperCase()} {(s.bytes / 1048576).toFixed(1)} MB</span></div>
                <button className="btn btn--quiet" type="button" onClick={() => play(s)}>Play</button>
              </li>
            ))}
          </ol>
        </section>
      </main>
      {playing && <Player job={playing} links={{}} onClose={() => setPlaying(null)} />}
    </div>
  )
}
