// Site looks. "crayon" is the hand-drawn storybook; "stage" is a dark 3D music room with a turntable.
// The choice is kept in localStorage and applied by a one-line script in each page's <head>
// before anything paints, so there is no flash of the other look.
export const THEMES = [
  { id: 'crayon', label: 'Crayon', color: '#f8f3e6' },
  { id: 'stage', label: 'Stage', color: '#121014' },
]
const KEY = 'sf-theme'

export function getTheme() {
  const t = document.documentElement.dataset.theme
  return THEMES.some((x) => x.id === t) ? t : 'crayon'
}

export function setTheme(id) {
  if (!THEMES.some((x) => x.id === id)) return
  document.documentElement.dataset.theme = id
  try { localStorage.setItem(KEY, id) } catch { /* storage off */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((x) => x.id === id).color)
  dispatchEvent(new CustomEvent('sf-theme', { detail: id }))
}

/** A small "Look: Crayon | Stage" switch, as plain DOM for the static landing page. */
export function mountThemeSwitch(el) {
  if (!el) return
  const render = () => {
    el.innerHTML = ''
    for (const t of THEMES) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = t.label
      b.setAttribute('aria-pressed', String(getTheme() === t.id))
      b.addEventListener('click', () => setTheme(t.id))
      el.append(b)
    }
  }
  render()
  addEventListener('sf-theme', render)
}
