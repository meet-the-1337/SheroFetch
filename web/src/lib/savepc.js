// Saving many songs at once, with albums and playlists kept as folders and .m3u8 files.
//
// In Chrome and Edge on a computer the person picks a folder once (their Music folder, say) and
// every song is streamed straight into Artist/Album/, never held in memory, so 200 FLACs are fine.
// Songs already there are skipped, so running it again only fetches what is missing.
// Other browsers get one download per song instead.
import { vaultPaths, isNative, saveToPhone, writePhoneText } from './native.js'
import { loadLrc } from '../app/data.js'

export const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window

const PARALLEL = 3

async function dirAt(root, path) {
  let d = root
  for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create: true })
  return d
}

async function existingSize(dir, name) {
  try { return (await (await dir.getFileHandle(name)).getFile()).size } catch { return 0 }
}

async function writeStream(dir, name, url, signal, onBytes) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(res.status === 404 ? 'the machine no longer has it' : `the machine answered ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const handle = await dir.getFileHandle(`${name}.part`, { create: true })
  const out = await handle.createWritable()
  let got = 0
  const count = new TransformStream({ transform(chunk, c) { got += chunk.byteLength; onBytes?.(got, total); c.enqueue(chunk) } })
  try {
    await res.body.pipeThrough(count).pipeTo(out, { signal })
  } catch (err) {
    await dir.removeEntry(`${name}.part`).catch(() => {})
    throw err
  }
  if (total && got < total) throw new Error('the download was cut short')
  // Rename by copy: FileSystemHandle.move is not everywhere yet.
  if (handle.move) { await dir.removeEntry(name).catch(() => {}); await handle.move(name) } else {
    const final = await (await dir.getFileHandle(name, { create: true })).createWritable()
    await final.write(await handle.getFile())
    await final.close()
    await dir.removeEntry(`${name}.part`)
  }
  return got
}

async function writeText(root, path, text) {
  const parts = path.split('/')
  const dir = await dirAt(root, parts.slice(0, -1).join('/'))
  const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable()
  await w.write(text)
  await w.close()
}

/** An .m3u8 that sits in Playlists/ and points at ../Artist/Album/file, as Poweramp and VLC read it. */
export function m3u8(name, items) {
  const lines = ['#EXTM3U', `#PLAYLIST:${name}`]
  for (const { job } of items) {
    const r = job.result || {}
    lines.push(`#EXTINF:${Math.round(r.duration || job.duration || -1)},${r.artist || ''} - ${r.track || ''}`, `../${vaultPaths(r).audio}`)
  }
  return lines.join('\n') + '\n'
}

/**
 * items: [{ job, file, cover }]; playlists: [{ name, items }].
 * report({ done, failed, skipped, bytes, current }) is called as it goes.
 * Returns { done, failed: [{ job, why }], skipped }.
 */
export async function saveMany(items, playlists, { report, signal, root }) {
  const state = { done: 0, skipped: 0, failed: [], bytes: 0, current: new Map() }
  const tell = () => report?.({ ...state, current: [...state.current.values()] })
  const queue = items.slice()

  async function one({ job, file, cover }) {
    const r = job.result || {}
    const p = vaultPaths(r)
    state.current.set(job.id, { name: `${r.artist} - ${r.track}`, pct: 0 })
    tell()
    try {
      if (!file) throw new Error('the machine holding it is asleep')
      if (isNative) {
        await saveToPhone({ ...job, lrc: await loadLrc(job) }, { file, cover }, (pct) => { state.current.set(job.id, { name: `${r.artist} - ${r.track}`, pct }); tell() })
      } else {
        const dir = await dirAt(root, p.dir)
        const name = p.audio.split('/').at(-1)
        const have = await existingSize(dir, name)
        if (have > 0 && (!r.size_mb || have > r.size_mb * 1048576 * 0.9)) { state.skipped++; return }
        let last = 0
        for (let attempt = 0; ; attempt++) {
          try {
            last = await writeStream(dir, name, file, signal, (got, total) => {
              state.current.set(job.id, { name: `${r.artist} - ${r.track}`, pct: total ? got / total : 0 })
              tell()
            })
            break
          } catch (err) {
            if (signal.aborted || attempt >= 2) throw err
            await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)))
          }
        }
        state.bytes += last
        if (cover && !(await existingSize(dir, 'cover.jpg'))) await writeStream(dir, 'cover.jpg', cover, signal).catch(() => {})
        const lrc = await loadLrc(job).catch(() => null)
        if (lrc) await writeText(root, p.lrc, lrc).catch(() => {})
      }
      state.done++
    } catch (err) {
      if (signal.aborted) throw err
      state.failed.push({ job, why: String(err?.message || err) })
    } finally {
      state.current.delete(job.id)
      tell()
    }
  }

  const lanes = Array.from({ length: isNative ? 2 : PARALLEL }, async () => {
    while (queue.length && !signal.aborted) await one(queue.shift())
  })
  await Promise.all(lanes)
  for (const pl of playlists) {
    const text = m3u8(pl.name, pl.items)
    const path = `Playlists/${pl.safe}.m3u8`
    if (isNative) await writePhoneText(path, text)?.catch(() => {})
    else await writeText(root, path, text).catch(() => {})
  }
  return state
}

/** Browsers without folder access: one download per song, spaced so none are dropped. */
export async function downloadEach(items, { report, signal }) {
  let done = 0
  for (const { file } of items) {
    if (signal.aborted) break
    if (file) {
      const a = document.createElement('a')
      a.href = file
      a.rel = 'noopener'
      document.body.append(a)
      a.click()
      a.remove()
      done++
    }
    report?.({ done, failed: [], skipped: 0, bytes: 0, current: [] })
    await new Promise((ok) => setTimeout(ok, 1200))
  }
  return { done, failed: [], skipped: 0 }
}
