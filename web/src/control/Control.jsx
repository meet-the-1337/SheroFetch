import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, rpc } from '../lib/supabase.js'
import { useSession } from '../app/data.js'

const ONLINE_MS = 75000
const bytes = (n) => (n == null ? 'n/a' : n < 1024 ? `${Math.round(n)} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`)
const rate = (n) => (n == null ? 'n/a' : `${bytes(n)}/s`)
const pct = (n) => (n == null ? 'n/a' : `${Math.round(n)}%`)
const ago = (iso) => {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  return s < 60 ? `${Math.round(s)} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`
}
const dur = (s) => (s == null ? 'n/a' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`)

export function Control() {
  const { session, profile } = useSession()
  if (session === undefined) return <main className="center"><p className="muted">Opening the Control Room…</p></main>
  if (!session) return <main className="center"><a className="wordmark" href="/">SheroFetch</a><p>Sign in as the owner first.</p><a className="btn btn--primary" href="/app#signin">Sign in</a></main>
  if (!profile) return <main className="center"><p className="muted">Loading…</p></main>
  if (profile.role !== 'owner') return <main className="center"><p>The Control Room is for the owner only.</p><a className="btn btn--quiet" href="/app">Back to the app</a></main>
  return <Room />
}

function useControlData() {
  const [d, setD] = useState({ workers: [], samples: [], events: [], jobs: [], invites: [], people: [], loaded: false, error: '' })
  const [probe, setProbe] = useState({ site: null, db: null })
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 6 * 3600e3).toISOString()
    const t0 = performance.now()
    const [w, s, e, j, i, p] = await Promise.all([
      supabase.from('workers').select('*').order('kind'),
      supabase.from('worker_samples').select('*').gte('at', since).order('at'),
      supabase.from('worker_events').select('*').order('at', { ascending: false }).limit(60),
      supabase.from('jobs').select('id,user_id,kind,query,title,artist,format,status,stage,progress,worker_id,error,created_at,started_at,finished_at,result').order('created_at', { ascending: false }).limit(300),
      supabase.from('invites').select('*').neq('role', 'worker').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at'),
    ])
    const dbMs = Math.round(performance.now() - t0)
    const err = [w, s, e, j, i, p].find((r) => r.error)?.error?.message || ''
    setD({ workers: w.data || [], samples: s.data || [], events: e.data || [], jobs: j.data || [], invites: i.data || [], people: p.data || [], loaded: true, error: err })
    const s0 = performance.now()
    const siteOk = await fetch('/manifest.webmanifest', { cache: 'no-store' }).then((r) => r.ok).catch(() => false)
    setProbe({ site: siteOk ? Math.round(performance.now() - s0) : false, db: err ? false : dbMs })
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    const ch = supabase.channel('control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'worker_events' }, load)
      .subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [load])
  return { ...d, probe, reload: load }
}

function Room() {
  const data = useControlData()
  const { workers, samples, events, jobs, invites, people, probe } = data
  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.username])), [people])
  const online = (w) => w.last_seen && Date.now() - new Date(w.last_seen).getTime() < ONLINE_MS
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const q = {
    waiting: jobs.filter((j) => j.status === 'queued' && j.kind === 'track').length,
    running: jobs.filter((j) => j.status === 'running'),
    doneToday: jobs.filter((j) => j.status === 'done' && new Date(j.finished_at) >= today && j.kind === 'track'),
    failedToday: jobs.filter((j) => j.status === 'failed' && new Date(j.finished_at) >= today),
  }
  const avgSecs = q.doneToday.length ? q.doneToday.reduce((a, j) => a + (new Date(j.finished_at) - new Date(j.started_at)) / 1000, 0) / q.doneToday.length : null
  const awake = workers.filter(online)
  const verdict = !data.loaded ? 'Checking…' : data.error ? `Supabase is not answering: ${data.error}` : awake.length === workers.length && workers.length ? 'Everything is hosting.' : awake.length ? `${awake.map((w) => w.name).join(' and ')} hosting, ${workers.filter((w) => !online(w)).map((w) => w.name).join(' and ')} asleep.` : 'No machine is hosting. Songs wait in the queue.'

  return (
    <div className="shell">
      <header className="bar">
        <a className="wordmark" href="/">SheroFetch</a>
        <span className="bar__title">Control Room</span>
        <div className="who"><a className="link" href="/app">Open the app</a><button className="btn btn--quiet" type="button" onClick={data.reload}>Refresh</button></div>
      </header>
      <main className="view view--control">
        <section className="route-health" aria-label="Service health">
          <h1>{verdict}</h1>
          <ol className="hops">
            <Hop name="Website" ok={probe.site !== false && probe.site !== null} detail={probe.site ? `answered in ${probe.site} ms` : probe.site === false ? 'not answering' : 'checking'} />
            <Hop name="Supabase" ok={probe.db !== false && probe.db !== null} detail={probe.db ? `query took ${probe.db} ms` : probe.db === false ? 'not answering' : 'checking'} />
            {workers.map((w) => <Hop key={w.id} name={w.name} ok={online(w)} warn={online(w) && w.stats?.tunnel !== 'up'} detail={online(w) ? (w.stats?.tunnel === 'up' ? 'hosting, tunnel up' : `awake, tunnel ${w.stats?.tunnel || 'unknown'}`) : `asleep, last heard ${ago(w.last_seen)}`} />)}
          </ol>
          <dl className="figures">
            <div><dt>Waiting</dt><dd>{q.waiting}</dd></div>
            <div><dt>Fetching now</dt><dd>{q.running.length}</dd></div>
            <div><dt>Done today</dt><dd>{q.doneToday.length}</dd></div>
            <div><dt>Failed today</dt><dd>{q.failedToday.length}</dd></div>
            <div><dt>Average fetch</dt><dd>{avgSecs ? `${Math.round(avgSecs)} s` : 'n/a'}</dd></div>
          </dl>
        </section>

        <section className="machines-grid" aria-label="Machines">
          {workers.map((w) => <Machine key={w.id} w={w} online={online(w)} samples={samples.filter((s) => s.worker_id === w.id)} running={q.running.filter((j) => j.worker_id === w.id)} />)}
          {!workers.length && <p className="muted">No machine has reported in yet.</p>}
        </section>

        <section aria-labelledby="queue-h">
          <h2 id="queue-h">Queue</h2>
          <table className="table">
            <thead><tr><th>Song</th><th>For</th><th>Status</th><th>Machine</th><th>Asked</th></tr></thead>
            <tbody>
              {jobs.filter((j) => j.kind === 'track').slice(0, 25).map((j) => (
                <tr key={j.id} className={`st-${j.status}`}>
                  <td>{j.result?.track || j.title || j.query}<span className="cell-sub">{j.result?.artist || j.artist || ''}</span></td>
                  <td>{names[j.user_id] || 'someone'}</td>
                  <td>{j.status === 'running' ? `${j.stage || 'fetching'} (${Math.round(j.progress * 100)}%)` : j.status === 'failed' ? `failed: ${j.error || ''}` : j.status}</td>
                  <td>{workers.find((w) => w.id === j.worker_id)?.name || ''}</td>
                  <td>{ago(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.length && <p className="muted">Nobody has asked for a song yet.</p>}
        </section>

        <div className="two">
          <Invites invites={invites} reload={data.reload} />
          <People people={people.filter((p) => p.role !== 'worker')} jobs={jobs} reload={data.reload} />
        </div>

        <section aria-labelledby="ev-h">
          <h2 id="ev-h">What the machines said</h2>
          <table className="table">
            <thead><tr><th>When</th><th>Machine</th><th>Level</th><th>Message</th></tr></thead>
            <tbody>{events.slice(0, 40).map((e) => (
              <tr key={e.id} className={`lv-${e.level}`}><td>{ago(e.at)}</td><td>{workers.find((w) => w.id === e.worker_id)?.name || e.worker_id}</td><td>{e.level}</td><td>{e.message}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </main>
    </div>
  )
}

function Hop({ name, ok, warn, detail }) {
  return <li className={`hop ${ok ? (warn ? 'is-warn' : 'is-ok') : 'is-down'}`}><b>{name}</b><span>{detail}</span></li>
}

function Spark({ values, label, format }) {
  const vals = values.filter((v) => v != null)
  if (vals.length < 2) return <figure className="spark"><figcaption>{label}</figcaption><p className="muted small">Not enough samples yet</p></figure>
  const max = Math.max(...vals, 1e-9)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 200},${48 - ((v ?? 0) / max) * 44}`).join(' ')
  return (
    <figure className="spark">
      <figcaption>{label}<span>{format(vals[vals.length - 1])} now, peak {format(max)}</span></figcaption>
      <svg viewBox="0 0 200 50" preserveAspectRatio="none" role="img" aria-label={`${label}, last 6 hours`}><polyline points={pts} /></svg>
    </figure>
  )
}

function Machine({ w, online, samples, running }) {
  const s = w.stats || {}
  const traffic = samples.reduce((a, x) => a + ((x.rx_bps || 0) + (x.tx_bps || 0)) * 60, 0)
  return (
    <article className={`machine ${online ? 'is-ok' : 'is-down'}`} aria-label={w.name}>
      <header><h2>{w.name}</h2><strong>{online ? (running.length ? `fetching ${running.length}` : 'hosting, idle') : 'asleep'}</strong></header>
      <p className="muted small">{online ? `${s.os || ''}, up ${dur(s.uptime_s)}, worker ${w.version}` : `Last heard from ${ago(w.last_seen)}`}</p>
      {running.map((j) => <p key={j.id} className="note">{j.title || j.query}: {j.stage} ({Math.round(j.progress * 100)}%)</p>)}
      <dl className="kv">
        <div><dt>CPU</dt><dd>{pct(s.cpu)}</dd></div>
        <div><dt>Load</dt><dd>{s.load1 ?? 'n/a'}</dd></div>
        <div><dt>Memory used</dt><dd>{pct(s.mem_pct)}</dd></div>
        <div><dt>Temperature</dt><dd>{s.temp_c != null ? `${s.temp_c} °C` : 'n/a'}</dd></div>
        <div><dt>Battery</dt><dd>{s.battery ? `${s.battery.pct}%${s.battery.charging ? ', charging' : ''}` : 'n/a'}</dd></div>
        <div><dt>Disk free</dt><dd>{s.disk_free_gb != null ? `${s.disk_free_gb} GB` : 'n/a'}</dd></div>
        <div><dt>Download now</dt><dd>{rate(s.rx_bps)}</dd></div>
        <div><dt>Upload now</dt><dd>{rate(s.tx_bps)}</dd></div>
        <div><dt>Traffic, 6 h</dt><dd>{bytes(traffic)}</dd></div>
        <div><dt>Served</dt><dd>{bytes(s.bytes_served)}</dd></div>
        <div><dt>Supabase latency</dt><dd>{s.latency_ms != null ? `${s.latency_ms} ms` : 'n/a'}</dd></div>
        <div><dt>Tunnel</dt><dd>{s.tunnel || 'n/a'}{s.tunnel_restarts ? `, ${s.tunnel_restarts} restarts` : ''}</dd></div>
        <div><dt>Local server :5050</dt><dd>{s.backend_5050 ? 'up' : 'down'}</dd></div>
        <div><dt>Soulseek</dt><dd>{s.sockseek ? (s.soulseek_account ? 'ready' : 'no account') : 'not installed'}</dd></div>
        <div><dt>yt-dlp</dt><dd>{s.ytdlp || 'n/a'}</dd></div>
        <div><dt>This run</dt><dd>{s.done ?? 0} done, {s.failed ?? 0} failed</dd></div>
      </dl>
      <div className="sparks">
        <Spark label="CPU" values={samples.map((x) => x.cpu)} format={pct} />
        <Spark label="Download" values={samples.map((x) => x.rx_bps)} format={rate} />
        <Spark label="Upload" values={samples.map((x) => x.tx_bps)} format={rate} />
      </div>
    </article>
  )
}

function Invites({ invites, reload }) {
  const [form, setForm] = useState({ note: '', uses: 1, days: 14 })
  const [msg, setMsg] = useState('')
  async function create(e) {
    e.preventDefault()
    try {
      const code = await rpc('create_invite', { p_note: form.note, p_max_uses: Number(form.uses), p_days: Number(form.days) })
      setMsg(`New code: ${code}. Share it with the person, along with the link sherofetch.vercel.app/app#join.`)
      setForm({ ...form, note: '' })
      reload()
    } catch (err) { setMsg(err.message) }
  }
  const live = (i) => !i.revoked && i.uses < i.max_uses && (!i.expires_at || new Date(i.expires_at) > new Date())
  return (
    <section aria-labelledby="inv-h">
      <h2 id="inv-h">Invite codes</h2>
      <form className="inline-form" onSubmit={create}>
        <label className="lbl">Who is it for<input className="field" value={form.note} maxLength={80} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="a name you will recognise" /></label>
        <label className="lbl">Uses<input className="field" type="number" min="1" max="100" value={form.uses} onChange={(e) => setForm({ ...form, uses: e.target.value })} /></label>
        <label className="lbl">Valid for days<input className="field" type="number" min="0" max="365" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></label>
        <button className="btn btn--primary" type="submit">Create code</button>
      </form>
      <p className="help" aria-live="polite">{msg}</p>
      <table className="table">
        <thead><tr><th>Code</th><th>For</th><th>Used</th><th>State</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>{invites.map((i) => (
          <tr key={i.code}>
            <td><code>{i.code}</code></td><td>{i.note || ''}</td><td>{i.uses} of {i.max_uses}</td>
            <td>{i.role === 'owner' ? 'owner code' : live(i) ? (i.expires_at ? `until ${new Date(i.expires_at).toLocaleDateString()}` : 'open') : i.revoked ? 'revoked' : 'used up or expired'}</td>
            <td>{live(i) && i.role === 'member' && <button className="btn btn--ghost" type="button" onClick={() => rpc('revoke_invite', { p_code: i.code }).then(reload)}>Revoke</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  )
}

function People({ people, jobs, reload }) {
  const count = (id) => jobs.filter((j) => j.user_id === id && j.kind === 'track' && Date.now() - new Date(j.created_at) < 86400e3).length
  return (
    <section aria-labelledby="ppl-h">
      <h2 id="ppl-h">People</h2>
      <table className="table">
        <thead><tr><th>Name</th><th>Role</th><th>Last 24 h</th><th>Daily limit</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>{people.map((p) => (
          <tr key={p.id} className={p.disabled ? 'is-paused' : ''}>
            <td>{p.username}</td><td>{p.role}{p.disabled ? ', paused' : ''}</td><td>{count(p.id)}</td>
            <td>{p.role === 'owner' ? 'none' : (
              <input className="field field--tiny" type="number" min="0" max="1000" defaultValue={p.daily_limit} aria-label={`Daily limit for ${p.username}`}
                onBlur={(e) => rpc('set_member', { p_user: p.id, p_disabled: p.disabled, p_daily_limit: Number(e.target.value) }).then(reload)} />
            )}</td>
            <td>{p.role !== 'owner' && <button className="btn btn--ghost" type="button" onClick={() => rpc('set_member', { p_user: p.id, p_disabled: !p.disabled, p_daily_limit: p.daily_limit }).then(reload)}>{p.disabled ? 'Resume' : 'Pause'}</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  )
}
