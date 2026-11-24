import { readPalette } from '../three/color.js'

// Redraws album art in crayon: flattened fills, wax streaks over paper tooth, ink edges.
const FRAG = `
precision mediump float;
uniform sampler2D uTex; uniform vec2 uRes; uniform vec3 uPaper; uniform vec3 uInk; uniform float uSeed;
varying vec2 vUv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.,0.)), u.x), mix(hash12(i+vec2(0.,1.)), hash12(i+vec2(1.,1.)), u.x), u.y); }
float tooth(vec2 px){ return vn(px * 0.85) * 0.5 + vn(px * 0.31 + 3.1) * 0.32 + vn(px * 0.045 + 9.7) * 0.18; }
float strokes(vec2 px, float ang, float spacing, float width, float seed){
  vec2 d = vec2(cos(ang), sin(ang));
  float across = dot(px, vec2(-d.y, d.x)) / spacing; float along = dot(px, d); float row = floor(across);
  float wob = (vn(vec2(along * 0.035, row * 3.7 + seed)) - 0.5) * 0.7;
  float l = abs(fract(across + wob) - 0.5) * 2.0;
  return 1.0 - smoothstep(width - 0.2, width + 0.08, l);
}
float lum(vec2 uv){ return dot(texture2D(uTex, uv).rgb, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = vUv * uRes;
  vec3 c = texture2D(uTex, vUv).rgb;
  vec3 q = mix(c, floor(c * 4.0 + 0.5) / 4.0, 0.6);
  float t = tooth(px * 1.4);
  float cover = mix(0.5, 1.0, strokes(px * 1.4, 1.05, 3.2, 0.7, uSeed)) * smoothstep(0.06, 0.48, t + 0.3);
  vec3 col = mix(uPaper, q, cover);
  vec2 o = 1.4 / uRes;
  float gx = lum(vUv + vec2(o.x, 0.)) - lum(vUv - vec2(o.x, 0.));
  float gy = lum(vUv + vec2(0., o.y)) - lum(vUv - vec2(0., o.y));
  float e = smoothstep(0.12, 0.34, length(vec2(gx, gy))) * smoothstep(0.1, 0.4, t + 0.2);
  gl_FragColor = vec4(mix(col, uInk, e * 0.8), 1.0);
}`
const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

const SIZE = 168
let gl, prog, canvas, failed = false
const cache = new Map()
let chain = Promise.resolve()

function init() {
  canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false })
  if (!gl) { failed = true; return }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s }
  prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { failed = true; return }
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const pal = readPalette()
  gl.uniform3fv(gl.getUniformLocation(prog, 'uPaper'), pal.paper)
  gl.uniform3fv(gl.getUniformLocation(prog, 'uInk'), pal.ink)
  gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), SIZE, SIZE)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

const load = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

export const artProxy = (url) => `/api/art?u=${encodeURIComponent(url)}`

// Returns a data URL of the crayon version, or the plain proxied art when WebGL is unavailable.
export function crayonize(url, seed = 1) {
  if (!url) return Promise.resolve('')
  // The Stage look shows album art as it is.
  if (document.documentElement.dataset.theme === 'stage') return Promise.resolve(url)
  if (cache.has(url)) return cache.get(url)
  const job = chain
    .then(async () => {
      if (!gl && !failed) init()
      const img = await load(artProxy(url))
      if (failed) return img.src
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      gl.uniform1f(gl.getUniformLocation(prog, 'uSeed'), seed)
      gl.viewport(0, 0, SIZE, SIZE)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return canvas.toDataURL('image/jpeg', 0.86)
    })
    .catch(() => artProxy(url))
  chain = job
  cache.set(url, job)
  return job
}
