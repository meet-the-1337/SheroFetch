import { useMemo, useRef, useState } from 'react'
import { rpc } from '../lib/supabase.js'
import { isNative, safeName } from '../lib/native.js'
import { canPickFolder, saveMany, downloadEach } from '../lib/savepc.js'
import { explainFailure, ytSearch, ytMusicSearch, YT_LINK, cleanYt, fileUrl, fmtTime, machineName } from './data.js'

// A playlist without a name gets a readable label from its link instead of the raw address.
function playlistLabel(link) {
  try {
    const h = new URL(link).hostname
    const where = /spotify/.test(h) ? 'Spotify' : /youtube|youtu\.be/.test(h) ? 'YouTube' : /apple/.test(h) ? 'Apple Music' : /jiosaavn/.test(h) ? 'JioSaavn' : h.replace(/^www\./, '')
    return `${where} playlist`
  } catch { return 'Playlist' }
}

/** Playlists with their songs: [{ parent, kids, name }], newest first. */
export function usePlaylists(jobs) {
  return useMemo(() => {
    const kids = new Map()
    for (const j of jobs) if (j.parent_id) (kids.get(j.parent_id) || kids.set(j.parent_id, []).get(j.parent_id)).push(j)
    return jobs.filter((j) => j.kind === 'playlist').map((parent) => {
      const list = (kids.get(parent.id) || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      return { parent, kids: list, name: parent.result?.name || playlistLabel(parent.query) }
    })
  }, [jobs])
}

export function tally(kids) {
  const t = { done: 0, open: 0, running: 0, failed: 0 }
  for (const k of kids) {
    if (k.status === 'done') t.done++
    else if (k.status === 'running') { t.running++; t.open++ }
    else if (k.status === 'queued') t.open++
    else t.failed++
  }
  return t
}

/* ---------------------------------------------------------------- why it failed, and what to try */

export function FailHelp({ job }) {
  const why = explainFailure(job)
  const [link, setLink] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const want = job.duration || 0
  const picks = (job.result?.candidates || []).slice(0, 4)

  async function retry(args, label) {
    setBusy(true)
    setMsg('')
    try {
      await rpc(args ? 'retry_job_as' : 'retry_job', { p_job: job.id, ...(args || {}) })
      setMsg(label)
    } catch (err) {
      setMsg(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }
  function usePasted(e) {
    e.preventDefault()
    const url = cleanYt(link)
    if (!YT_LINK.test(url)) return setMsg('Paste a YouTube video link, like youtube.com/watch?v=…')
    retry({ p_url: url }, 'Fetching from the link you pasted.')
  }

  return (
    <div className="failhelp">
      <p className="failhelp__why"><b>{why.title}.</b> {why.hint}</p>
      {why.raw && <p className="failhelp__raw">The machine said: {why.raw}</p>}
      {picks.length > 0 && (
        <>
          <p className="failhelp__lead">Uploads Shero found. Pick one only if it is your song:</p>
          <ul className="picks">
            {picks.map((c) => {
              const gap = want && c.duration ? Math.round(c.duration - want) : null
              return (
                <li key={c.url}>
                  <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
                  <span>{c.channel}{c.duration ? `, ${fmtTime(c.duration)}` : ''}{gap === null ? '' : Math.abs(gap) <= 3 ? ', same length as the song' : `, ${Math.abs(gap)}s ${gap > 0 ? 'longer' : 'shorter'}`}</span>
                  <button className="btn btn--quiet" type="button" disabled={busy} onClick={() => retry({ p_url: c.url }, 'Fetching that upload.')}>Use this</button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="failhelp__acts">
        <button className="btn btn--quiet" type="button" disabled={busy} onClick={() => retry(null, 'Back in the queue. Shero will ask Soulseek and YouTube again.')}>Try again</button>
        {job.format !== 'mp3' && <button className="btn btn--quiet" type="button" disabled={busy} onClick={() => retry({ p_format: 'mp3' }, 'Trying as MP3. Far more copies exist, so it finds more songs.')}>Try as MP3</button>}
        <a className="btn btn--ghost" href={ytSearch(job)} target="_blank" rel="noreferrer">Search YouTube</a>
        <a className="btn btn--ghost" href={ytMusicSearch(job)} target="_blank" rel="noreferrer">Search YouTube Music</a>
      </div>
      <form className="failhelp__paste" onSubmit={usePasted}>
        <label className="visually-hidden" htmlFor={`yt-${job.id}`}>YouTube link of this song</label>
        <input id={`yt-${job.id}`} className="field field--small" inputMode="url" autoComplete="off" spellCheck="false" placeholder="Found it? Paste the YouTube link here" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn btn--quiet" type="submit" disabled={busy || !link.trim()}>Fetch this link</button>
      </form>
      <p className="help" aria-live="polite">{msg}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- one playlist in the queue */

export function PlaylistCard({ pl, Row }) {
  const { parent, kids, name } = pl
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const t = tally(kids)
  const pending = parent.result?.pending?.length || 0
  const total = kids.length + pending
  if (parent.status !== 'done') {
    return <p className="note">{parent.status === 'failed' ? `Could not read the playlist: ${parent.error}` : parent.status === 'cancelled' ? 'Playlist cancelled' : 'Reading the playlist…'} {parent.query}</p>
  }
  const shown = open ? kids : kids.filter((k) => k.status === 'running' || k.status === 'failed' || k.status === 'cancelled')
  async function more() {
    try {
      const n = await rpc('queue_more', { p_parent: parent.id })
      setMsg(n ? `Added ${n} more songs.` : 'Today’s limit is used up. The rest can be added tomorrow.')
    } catch (err) { setMsg(String(err?.message || err)) }
  }
  return (
    <article className="plcard" aria-label={`Playlist ${name}`}>
      <header>
        <h2>{name}</h2>
        <span className="muted">{t.done} of {total} ready{t.open ? `, ${t.open} to go` : ''}{t.failed ? `, ${t.failed} need you` : ''}</span>
      </header>
      <progress max={total || 1} value={t.done} aria-label={`${t.done} of ${total} songs ready`} />
      {pending > 0 && (
        <p className="note">{pending} more {pending === 1 ? 'song waits' : 'songs wait'} because of the daily limit. <button className="link" type="button" onClick={more}>Add the next batch</button></p>
      )}
      <div className="plcard__acts">
        {t.failed > 0 && <button className="btn btn--quiet" type="button" onClick={async () => setMsg(`${await rpc('retry_failed', { p_parent: parent.id })} songs back in the queue.`)}>Retry {t.failed} failed</button>}
        {t.open > 0 && <button className="btn btn--ghost" type="button" onClick={() => rpc('cancel_job', { p_job: parent.id })}>Cancel the rest</button>}
        <button className="btn btn--ghost" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : `Show all ${kids.length} songs`}</button>
      </div>
      <p className="help" aria-live="polite">{msg}</p>
      {shown.length > 0 && <ol className="rows">{shown.map((k) => <Row key={k.id} job={k} />)}</ol>}
    </article>
  )
}

/* ---------------------------------------------------------------- pick songs and playlists to save */

export function SavePicker({ done, playlists, links, onClose }) {
  const [sel, setSel] = useState(() => new Set())
  const [run, setRun] = useState(null)
  const abort = useRef(null)
  const lists = playlists.map((p) => ({ ...p, ready: p.kids.filter((k) => k.status === 'done') })).filter((p) => p.ready.length)
  const loose = done.filter((j) => !j.parent_id)
  const has = (j) => sel.has(j.id)
  const toggle = (ids, on) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })
  const chosen = done.filter(has)
  const asleep = chosen.filter((j) => !fileUrl(j, links)).length
  const sizeMb = chosen.reduce((a, j) => a + (j.result?.size_mb || 0), 0)
  const where = isNative ? 'this phone' : 'your PC'

  async function start() {
    const items = chosen.map((job) => ({ job, file: fileUrl(job, links, 'file', true), cover: fileUrl(job, links, 'cover') }))
    const pls = lists.map((p) => ({ name: p.name, safe: safeName(p.name, 'Playlist'), items: p.ready.filter(has).map((job) => ({ job })) })).filter((p) => p.items.length)
    let root = null
    if (!isNative && canPickFolder) {
      try { root = await window.showDirectoryPicker({ id: 'sherofetch', mode: 'readwrite', startIn: 'music' }) } catch { return }
    }
    abort.current = new AbortController()
    setRun({ done: 0, failed: [], skipped: 0, bytes: 0, current: [], total: items.length })
    const report = (s) => setRun((r) => ({ ...r, ...s }))
    try {
      const out = isNative || root ? await saveMany(items, pls, { report, signal: abort.current.signal, root }) : await downloadEach(items, { report, signal: abort.current.signal })
      setRun((r) => ({ ...r, ...out, finished: true }))
    } catch {
      setRun((r) => ({ ...r, finished: true, stopped: true }))
    }
  }

  if (run) {
    const left = run.total - run.done - run.skipped - run.failed.length
    return (
      <section className="picker" aria-labelledby="save-title">
        <h2 id="save-title">{run.finished ? (run.stopped ? 'Stopped' : `Saved to ${where}`) : `Saving to ${where}`}</h2>
        <progress max={run.total || 1} value={run.done + run.skipped + run.failed.length} aria-label="Songs saved" />
        <p>{run.done} saved{run.skipped ? `, ${run.skipped} already there` : ''}{run.failed.length ? `, ${run.failed.length} could not be saved` : ''}{!run.finished && left > 0 ? `, ${left} to go` : ''}{run.bytes ? `, ${(run.bytes / 1073741824).toFixed(2)} GB` : ''}</p>
        {run.current?.map((c) => <p key={c.name} className="muted small">{c.name} {c.pct ? `${Math.round(c.pct * 100)}%` : ''}</p>)}
        {run.failed.length > 0 && <ul className="small">{run.failed.map((f) => <li key={f.job.id}>{f.job.result?.track}: {f.why}</li>)}</ul>}
        {run.finished && !isNative && canPickFolder && <p className="muted small">Albums are in Artist/Album folders and playlists in Playlists/ as .m3u8 files. Run it again any time: songs already there are skipped.</p>}
        {run.finished && !isNative && !canPickFolder && <p className="muted small">Each song went to your Downloads. Chrome or Edge can save straight into a folder with albums and playlists.</p>}
        <div className="plcard__acts">
          {!run.finished && <button className="btn btn--quiet" type="button" onClick={() => abort.current?.abort()}>Stop</button>}
          {run.finished && <button className="btn btn--primary" type="button" onClick={onClose}>Done</button>}
        </div>
      </section>
    )
  }

  const allIds = done.map((j) => j.id)
  return (
    <section className="picker" aria-labelledby="pick-title">
      <div className="picker__head">
        <h2 id="pick-title">Pick what to keep on {where}</h2>
        <label className="check"><input type="checkbox" checked={sel.size === allIds.length && allIds.length > 0} onChange={(e) => toggle(allIds, e.target.checked)} /> Everything ({allIds.length})</label>
      </div>
      {lists.length > 0 && <h3 className="sub sub--small">Playlists</h3>}
      <ul className="picklist">
        {lists.map((p) => {
          const ids = p.ready.map((k) => k.id)
          const n = ids.filter((id) => sel.has(id)).length
          return (
            <li key={p.parent.id}>
              <label className="check">
                <input type="checkbox" checked={n === ids.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length }} onChange={(e) => toggle(ids, e.target.checked)} />
                <b>{p.name}</b> <span className="muted">{ids.length} songs{p.kids.length > ids.length ? `, ${p.kids.length - ids.length} not ready yet` : ''}</span>
              </label>
              <details>
                <summary>Pick single songs</summary>
                <ul className="picklist picklist--inner">
                  {p.ready.map((k) => <SongCheck key={k.id} job={k} on={has(k)} toggle={toggle} />)}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
      {loose.length > 0 && <h3 className="sub sub--small">Single songs</h3>}
      <ul className="picklist">{loose.map((j) => <SongCheck key={j.id} job={j} on={has(j)} toggle={toggle} />)}</ul>
      <div className="picker__bar">
        <span>{chosen.length} {chosen.length === 1 ? 'song' : 'songs'}{sizeMb ? `, about ${sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${Math.round(sizeMb)} MB`}` : ''}{asleep ? `. ${asleep} sit on a machine that is asleep and will be skipped` : ''}</span>
        <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" type="button" disabled={!chosen.length} onClick={start}>{isNative ? 'Save to phone' : canPickFolder ? 'Choose a folder and save' : 'Download them'}</button>
      </div>
    </section>
  )
}

function SongCheck({ job, on, toggle }) {
  const r = job.result || {}
  return (
    <li>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => toggle([job.id], e.target.checked)} />
        <span>{r.track}</span> <span className="muted">{r.artist}, {r.ext?.toUpperCase()} {r.size_mb ? `${r.size_mb} MB` : ''} ({machineName(job.worker_id)})</span>
      </label>
    </li>
  )
}
