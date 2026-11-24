import { SUPABASE_URL, SUPABASE_KEY, hasBackend, hasSession, FORMATS, savedFormat, saveFormat, PLAYLIST_RE } from '../lib/config.js'
import { crayonize } from '../lib/covers.js'

const $ = (s, el = document) => el.querySelector(s)
const html = document.documentElement

const webgl = (() => {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
})()
if (webgl) html.classList.add('webgl')

/* ---------- the hero pup ---------- */
let hero = null
if (webgl) {
  import('./hero.js').then(({ mountHero }) => {
    hero = mountHero($('[data-hero-canvas]'), $('[data-bubble]'))
    if (!hero) html.classList.remove('webgl')
  })
}

/* ---------- live machines ---------- */
const ago = (iso) => {
  if (!iso) return 'Never heard from yet'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'Last heard from just now'
  if (s < 3600) return `Last heard from ${Math.round(s / 60)} minutes ago`
  if (s < 86400) return `Last heard from ${Math.round(s / 3600)} hours ago`
  return `Last heard from ${Math.round(s / 86400)} days ago`
}
const stateWord = (m) => (!m ? 'Not set up' : m.busy ? 'Fetching a song' : m.online ? 'Awake' : 'Asleep')

function summary(pc, phone) {
  const name = (m) => (m.kind === 'pc' ? 'the PC' : 'the phone')
  const awake = [pc, phone].filter((m) => m?.online)
  if (awake.length === 2) return 'Right now <strong>the PC and the phone are both awake</strong>.'
  if (awake.length === 1) {
    const other = awake[0] === pc ? phone : pc
    return `Right now <strong>${name(awake[0])} is awake</strong>${other ? ` and ${name(other)} is asleep` : ''}.`
  }
  return 'Right now <strong>both machines are asleep</strong>. Songs wait in the queue until one wakes up.'
}

async function refreshStatus() {
  const line = $('[data-awake]')
  if (!hasBackend) { line.textContent = 'Machine status is not connected yet.'; return }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_status`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
      body: '{}',
    })
    if (!r.ok) throw new Error(String(r.status))
    const data = await r.json()
    const pc = data.machines.find((m) => m.kind === 'pc')
    const phone = data.machines.find((m) => m.kind === 'phone')
    line.innerHTML = summary(pc, phone)
    for (const [kind, m] of [['pc', pc], ['phone', phone]]) {
      const node = $(`[data-machine="${kind}"]`)
      node.classList.toggle('is-awake', Boolean(m?.online))
      $('[data-state]', node).textContent = stateWord(m)
      $('[data-seen]', node).textContent = m ? `${ago(m.last_seen)}. ${m.fetched_today} fetched today.` : ''
      document.querySelector(`[data-route="${kind}"]`)?.classList.toggle('is-live', Boolean(m?.online))
    }
    $('[data-queue]').textContent = data.queued === 0 ? 'Nothing waiting' : `Songs waiting: ${data.queued}`
  } catch {
    line.textContent = 'Machine status is unavailable right now.'
  }
}
refreshStatus()
setInterval(() => { if (!document.hidden) refreshStatus() }, 30000)

/* ---------- search and fetch ---------- */
const form = $('[data-fetch]')
const input = $('#q')
const help = $('#fetch-help')
const list = $('#results')
let results = [], picked = -1, timer = 0, seq = 0

const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

function render() {
  list.replaceChildren()
  list.hidden = results.length === 0
  results.forEach((r, i) => {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'pick'
    b.setAttribute('aria-pressed', String(i === picked))
    const img = document.createElement('img')
    img.width = 56
    img.height = 56
    img.alt = ''
    const text = document.createElement('div')
    const t = document.createElement('b')
    t.textContent = r.title
    const s = document.createElement('span')
    s.textContent = r.album ? `${r.artist}, ${r.album}` : r.artist
    text.append(t, s)
    const d = document.createElement('time')
    d.textContent = fmtTime(r.duration)
    b.append(img, text, d)
    b.addEventListener('click', () => choose(i))
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); list.children[i + 1]?.querySelector('button')?.focus() }
      if (e.key === 'ArrowUp') { e.preventDefault(); (list.children[i - 1]?.querySelector('button') || input).focus() }
    })
    li.append(b)
    list.append(li)
    crayonize(r.art, i + 1).then((src) => { if (src) img.src = src })
  })
}

async function search(q) {
  const mine = ++seq
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
    const data = await r.json()
    if (mine !== seq) return
    results = data.results || []
    picked = -1
    render()
    help.textContent = data.error || (results.length ? 'Pick the right one, and Shero fetches it.' : 'No match. Check the spelling, or add the artist.')
    hero?.results(results.length)
  } catch {
    if (mine === seq) help.textContent = 'Search is not answering right now. Try again in a minute.'
  }
}

input.addEventListener('input', () => {
  const q = input.value.trim()
  input.removeAttribute('aria-invalid')
  hero?.typing()
  if (q.toLowerCase().includes('chocobi')) hero?.treat()
  clearTimeout(timer)
  if (PLAYLIST_RE.test(q)) { results = []; render(); help.textContent = 'A link. Shero will fetch every song in it.'; return }
  if (q.length < 2) { results = []; render(); help.textContent = ''; return }
  timer = setTimeout(() => search(q), 280)
})
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); list.querySelector('button')?.focus() }
})

async function go(payload) {
  if (!hasSession()) {
    try { sessionStorage.setItem('sf-pending', JSON.stringify(payload)) } catch { /* private mode */ }
    help.innerHTML = 'Shero only fetches for friends with an invite. <a href="/app#signin">Sign in</a> or <a href="/app#join">use your invite code</a>, and this song waits for you.'
    hero?.needInvite()
    return
  }
  const params = new URLSearchParams({ fetch: JSON.stringify(payload) })
  await (hero ? Promise.race([hero.runOff(), new Promise((r) => setTimeout(r, 1600))]) : null)
  location.href = `/app?${params}`
}

function choose(i) {
  picked = i
  render()
  list.children[i]?.querySelector('button')?.focus()
  const r = results[i]
  go({ query: `${r.artist} - ${r.title}`, artist: r.artist, title: r.title, album: r.album, format: savedFormat() })
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const q = input.value.trim()
  if (!q) { input.setAttribute('aria-invalid', 'true'); help.textContent = 'Type a song name first.'; input.focus(); return }
  if (PLAYLIST_RE.test(q)) return go({ query: q, url: q, format: savedFormat() })
  if (results.length) return choose(Math.max(0, picked))
  search(q)
})

/* ---------- formats ---------- */
const card = $('[data-filecard]')
function showFormat(f) {
  const info = FORMATS[f]
  $('[data-ext]', card).textContent = `Artist - Title.${info.ext}`
  $('[data-size]', card).textContent = info.size
  $('[data-note]', card).textContent = info.note
}
const current = savedFormat()
document.getElementById(`fmt-${current}`).checked = true
showFormat(current)
document.querySelectorAll('input[name="fmt"]').forEach((r) => r.addEventListener('change', () => { saveFormat(r.value); showFormat(r.value) }))

/* ---------- the bone game, mounted when it nears the screen ---------- */
const gameStage = $('[data-game-stage]')
if (webgl) {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return
    io.disconnect()
    import('./game.js').then(({ mountGame }) => {
      mountGame($('[data-game-canvas]'), { bubbleEl: $('[data-game-bubble]'), scoreEl: $('[data-score]'), throwBtn: $('[data-throw]') })
    })
  }, { rootMargin: '400px 0px' })
  io.observe(gameStage)
} else {
  $('[data-throw]').disabled = true
}

/* ---------- install ---------- */
let deferred = null
const installBtn = $('[data-install]')
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  installBtn.hidden = false
  $('[data-install-hint]').hidden = true
})
installBtn.addEventListener('click', async () => {
  if (!deferred) return
  deferred.prompt()
  await deferred.userChoice
  deferred = null
  installBtn.hidden = true
})
fetch('/SheroFetch.apk', { method: 'HEAD' }).then((r) => {
  const a = $('[data-apk]')
  const n = Number(r.headers.get('content-length') || 0)
  if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) { a.hidden = true; return }
  if (n) a.textContent = `Download the Android app, ${(n / 1048576).toFixed(1)} MB`
}).catch(() => {})

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
