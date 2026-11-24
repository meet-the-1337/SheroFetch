// Song suggestions for the site. iTunes, Deezer and JioSaavn are asked together, merged, and ranked
// by how well each song matches what was typed, then by popularity, with originals ahead of remixes.
// Deezer's search answers an empty list in some countries (India among them) and JioSaavn covers
// Indian and regional music best, so one of the three missing never empties the suggestions.
const clean = (s) => String(s || '').trim()
const norm = (s) => clean(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const DERIVATIVE = /\b(remix|mix|karaoke|instrumental|cover|sped up|slowed|reverb|lofi|lo fi|live|acoustic|version|edit|nightcore|8d|tribute|made famous|originally performed|in the style)\b/
const FILLER = /\b(lullab|sleep|relax|karaoke|tribute|kids|nursery|rockabye|piano|instrumental|cover|meditation|workout|study|ambient|hits|party|dj |vitamin string)/i
const FEAT = /\s*[([]?\b(feat\.?|ft\.?|featuring|with)\b.*$/i
const FROM = /\s*[([]from\s+["“]?([^"”)\]]+)["”]?[)\]]\s*$/i
const ENTITIES = { amp: '&', quot: '"', apos: "'", '#039': "'", lt: '<', gt: '>' }
const unescape = (s) => clean(s).replace(/&(amp|quot|apos|#039|lt|gt);/g, (_, e) => ENTITIES[e])
const bareKey = (t) => norm(clean(t).replace(FROM, '').replace(FEAT, ''))
const artistsOf = (s) => clean(s).split(/\s+(?:and|x)\s+|,|&|\bfeat\.?|\bft\./i).map(norm).filter(Boolean)

async function itunes(q, country) {
  const r = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', limit: '30', country })}`, { redirect: 'error' })
  if (!r.ok) throw new Error(`itunes ${r.status}`)
  const data = await r.json()
  return (data.results || []).map((it, i) => ({
    title: clean(it.trackName), artist: clean(it.artistName), album: clean(it.collectionName),
    year: clean(it.releaseDate).slice(0, 4), duration: Math.round((it.trackTimeMillis || 0) / 1000),
    art: clean(it.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x600bb.'), explicit: it.trackExplicitness === 'explicit',
    _src: 'itunes', _pos: i, _pop: 0,
  }))
}

async function deezer(q) {
  const r = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: '30' })}`, { redirect: 'error' })
  if (!r.ok) throw new Error(`deezer ${r.status}`)
  const data = await r.json()
  return (data.data || []).map((it, i) => ({
    title: clean(it.title), artist: clean(it.artist?.name), album: clean(it.album?.title), year: '',
    duration: it.duration || 0, art: clean(it.album?.cover_xl || it.album?.cover_big), explicit: Boolean(it.explicit_lyrics),
    _src: 'deezer', _pos: i, _pop: it.rank || 0,
  }))
}

async function jiosaavn(q) {
  const params = new URLSearchParams({ __call: 'search.getResults', _format: 'json', _marker: '0', cc: 'in', includeMetaTags: '1', p: '1', n: '20', q })
  const r = await fetch(`https://www.jiosaavn.com/api.php?${params}`, { redirect: 'error' })
  if (!r.ok) throw new Error(`jiosaavn ${r.status}`)
  const data = await r.json()
  return (data.results || []).map((it, i) => {
    const raw = unescape(it.song || it.title)
    const from = raw.match(FROM)
    return {
      title: raw.replace(FROM, '').trim(),
      artist: unescape(it.primary_artists || it.more_info?.primary_artists).replace(/\s*,\s*/g, ', '),
      // "Song (From "Film")" sits on a compilation; the film is the real album
      album: from ? from[1].trim() : unescape(it.album || it.more_info?.album),
      year: clean(it.year || it.more_info?.year).slice(0, 4),
      duration: parseInt(it.duration || it.more_info?.duration || 0, 10) || 0,
      art: clean(it.image || it.more_info?.image).replace(/150x150/, '500x500'),
      explicit: String(it.explicit_content) === '1',
      _src: 'jiosaavn', _pos: i, _pop: parseInt(it.play_count || 0, 10) || 0,
    }
  })
}

function relevance(item, q) {
  const qn = norm(q)
  const qt = qn.split(' ').filter(Boolean)
  const title = norm(item.title)
  const bare = norm(item.title.replace(FEAT, ''))
  const artist = norm(item.artist)
  const both = `${title} ${artist}`
  let s = 0
  if (bare === qn || title === qn) s += 14
  else if (both.startsWith(qn) || `${artist} ${title}`.startsWith(qn)) s += 7
  else if (bare.startsWith(qn) || qn.startsWith(bare)) s += 5
  const hits = qt.filter((t) => both.split(' ').includes(t)).length
  s += (hits / Math.max(1, qt.length)) * 6
  if (qt.every((t) => both.includes(t))) s += 2
  if (qt.some((t) => artist.split(' ').includes(t))) s += 1.5
  if (DERIVATIVE.test(title) && !DERIVATIVE.test(qn)) s -= 6
  if (DERIVATIVE.test(norm(item.album)) && !DERIVATIVE.test(qn)) s -= 2
  if (FILLER.test(item.artist) && !FILLER.test(qn)) s -= 6
  s += Math.min(5, Math.log10((item._pop || 0) + 1) / 1.2)
  if (item._src === 'itunes' || item._itunesPos != null) s += Math.max(0, 6.5 - (item._itunesPos ?? item._pos) * 0.4)
  return s
}

export default async function handler(req, res) {
  const q = clean(req.query?.q).slice(0, 120)
  if (q.length < 2) return res.status(200).json({ results: [] })
  const country = /^[a-z]{2}$/i.test(req.query?.country || '') ? req.query.country : 'IN'
  const settled = await Promise.allSettled([itunes(q, country), deezer(q), jiosaavn(q)])
  const list = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
  if (!list.length) return res.status(502).json({ results: [], error: 'Search is not answering right now.' })

  // Merge the catalogues: same song, a shared artist, length within 6 seconds. JioSaavn lists the
  // composer and singer in any order, so artists are compared as sets, not by the first name.
  const merged = []
  for (const it of list) {
    if (!it.title) continue
    const key = bareKey(it.title)
    const names = artistsOf(it.artist)
    const twin = merged.find((m) => m._key === key && Math.abs((m.duration || 0) - (it.duration || 0)) <= 6 && m._names.some((n) => names.includes(n)))
    if (twin) {
      twin._pop = Math.max(twin._pop, it._pop)
      twin._pos = Math.min(twin._pos, it._pos)
      if (it._src === 'itunes') twin._itunesPos = Math.min(twin._itunesPos ?? 99, it._pos)
      if (!twin.year && it.year) twin.year = it.year
      for (const n of names) if (!twin._names.includes(n)) twin._names.push(n)
      if (twin._src !== 'itunes' && it._src === 'itunes') Object.assign(twin, { title: it.title, artist: it.artist, album: it.album, art: it.art || twin.art })
      continue
    }
    merged.push({ ...it, _key: key, _names: names, _itunesPos: it._src === 'itunes' ? it._pos : null })
  }
  // When several artists share a title, the earliest release is usually the original.
  const firstYear = {}
  for (const it of merged) {
    const t = bareKey(it.title)
    if (it.year && (!firstYear[t] || it.year < firstYear[t])) firstYear[t] = it.year
  }
  const results = merged
    .map((it) => {
      const t = bareKey(it.title)
      const shared = merged.filter((m) => bareKey(m.title) === t).length > 1
      return { ...it, _score: relevance(it, q) + (shared && it.year && it.year === firstYear[t] ? 3 : 0) }
    })
    .sort((x, y) => y._score - x._score)
    .slice(0, 20)
    .map(({ _key, _names, _src, _pos, _pop, _score, _itunesPos, ...it }) => ({ ...it, score: Math.round(_score * 10) / 10 }))
  res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({ results })
}
