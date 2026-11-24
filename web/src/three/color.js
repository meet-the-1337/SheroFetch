// Reads the palette from tokens.css so WebGL and the page share one source of colour.

function oklchToSrgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((c) => {
    const v = Math.min(1, Math.max(0, c))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  })
}

export function parseOklch(value) {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(value || '')
  if (!m) return [0.5, 0.5, 0.5]
  const L = m[2] === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1])
  return oklchToSrgb(L, parseFloat(m[3]), parseFloat(m[4]))
}

export function readPalette(el = document.documentElement) {
  const cs = getComputedStyle(el)
  const get = (name) => parseOklch(cs.getPropertyValue(name).trim())
  return {
    paper: get('--color-paper'),
    paper2: get('--color-paper-2'),
    ink: get('--color-ink'),
    muted: get('--color-muted'),
    red: get('--color-accent'),
    yellow: get('--color-field'),
    blue: get('--color-seal'),
    fur: get('--color-fur'),
    furShade: get('--color-fur-shade'),
  }
}
