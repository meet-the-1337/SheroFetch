import * as THREE from 'three'

// Shared GLSL: value noise, paper tooth and crayon strokes, all in screen pixels so every
// object is "drawn" on the same sheet of paper.
const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.,0.)), u.x), mix(hash12(i+vec2(0.,1.)), hash12(i+vec2(1.,1.)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.-2.*f);
  float a = mix(hash13(i), hash13(i+vec3(1.,0.,0.)), u.x);
  float b = mix(hash13(i+vec3(0.,1.,0.)), hash13(i+vec3(1.,1.,0.)), u.x);
  float c = mix(hash13(i+vec3(0.,0.,1.)), hash13(i+vec3(1.,0.,1.)), u.x);
  float d = mix(hash13(i+vec3(0.,1.,1.)), hash13(i+vec3(1.,1.,1.)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z); }
float fluff3(vec3 p){ return vnoise3(p) * 0.62 + vnoise3(p * 2.13 + 7.31) * 0.38; }
float tooth(vec2 px){ return vnoise2(px * 0.85) * 0.5 + vnoise2(px * 0.31 + 3.1) * 0.32 + vnoise2(px * 0.045 + 9.7) * 0.18; }
float strokes(vec2 px, float ang, float spacing, float width, float seed){
  vec2 d = vec2(cos(ang), sin(ang));
  float across = dot(px, vec2(-d.y, d.x)) / spacing;
  float along = dot(px, d);
  float row = floor(across);
  float wob = (vnoise2(vec2(along * 0.035, row * 3.7 + seed)) - 0.5) * 0.7;
  float gap = step(0.16, vnoise2(vec2(along * 0.021 + row * 1.37, seed * 1.9)));
  float l = abs(fract(across + wob) - 0.5) * 2.0;
  return (1.0 - smoothstep(width - 0.2, width + 0.08, l)) * gap;
}
`

const VERT = /* glsl */ `
uniform float uFluff; uniform float uFluffFreq; uniform vec3 uSeed;
varying vec3 vN;
${NOISE}
void main(){
  vec3 p = position + normal * uFluff * (fluff3(position * uFluffFreq + uSeed) - 0.5);
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const HULL_VERT = /* glsl */ `
uniform float uFluff; uniform float uFluffFreq; uniform vec3 uSeed; uniform float uThick; uniform float uBoil;
${NOISE}
void main(){
  vec3 p = position + normal * uFluff * (fluff3(position * uFluffFreq + uSeed) - 0.5);
  float w = uThick * (0.7 + 0.65 * vnoise3(position * 3.6 + vec3(uBoil * 1.73, uBoil * 0.61, 0.0)));
  p += normal * w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const COMMON_FRAG = /* glsl */ `
uniform vec3 uPaper; uniform vec3 uInk; uniform vec3 uColor; uniform vec3 uShade; uniform vec3 uLight;
uniform float uBoil; uniform float uDpr;
varying vec3 vN;
${NOISE}
float halfLambert(vec2 px){
  float hl = dot(normalize(vN), normalize(uLight)) * 0.5 + 0.5;
  return hl + (tooth(px * 0.6 + uBoil * 13.0) - 0.5) * 0.14;
}`

// White fur: mostly bare paper, shadow drawn with a pale crayon in hatch and cross-hatch.
const FUR_FRAG = /* glsl */ `
${COMMON_FRAG}
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  float hl = halfLambert(px);
  float t = tooth(px);
  float h1 = strokes(px, 0.78, 5.2, 0.42, uBoil) * smoothstep(0.64, 0.5, hl);
  float h2 = strokes(px, -0.62, 5.8, 0.36, uBoil + 3.0) * smoothstep(0.42, 0.28, hl);
  float cover = clamp(h1 * 0.8 + h2 * 0.9, 0.0, 1.0) * smoothstep(0.18, 0.55, t + 0.24);
  gl_FragColor = vec4(mix(uColor, uShade, cover), 1.0);
}`

// Coloured crayon: wax catches the paper's peaks, so the fill streaks and shows paper.
const FILL_FRAG = /* glsl */ `
${COMMON_FRAG}
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  float hl = halfLambert(px);
  float t = tooth(px);
  float streak = strokes(px, 1.08, 3.1, 0.64, uBoil);
  float cover = mix(0.58, 1.0, streak) * smoothstep(0.1, 0.5, t + 0.3);
  vec3 col = mix(uPaper, uColor, cover);
  float sh = smoothstep(0.56, 0.3, hl) * strokes(px, -0.6, 4.6, 0.42, uBoil + 5.0);
  col = mix(col, mix(uColor, uInk, 0.5), sh * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`

// Pressed-hard crayon: eyes, nose, doorway.
const INK_FRAG = /* glsl */ `
${COMMON_FRAG}
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  float t = tooth(px);
  gl_FragColor = vec4(mix(uPaper, uColor, smoothstep(0.02, 0.3, t + 0.22)), 1.0);
}`

const HULL_FRAG = /* glsl */ `
uniform vec3 uInk; uniform float uDpr; uniform float uBoil;
${NOISE}
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  if (tooth(px + uBoil * 7.0) < 0.17) discard;
  gl_FragColor = vec4(uInk, 1.0);
}`

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uInk; uniform float uDpr; uniform float uBoil; uniform float uStrength;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  float r = length((vUv - 0.5) * 2.0);
  float inside = 1.0 - smoothstep(0.55, 1.0, r + (vnoise2(px * 0.05 + uBoil) - 0.5) * 0.25);
  float s = max(strokes(px, 0.3, 4.0, 0.5, uBoil + 9.0), strokes(px, -0.9, 5.0, 0.4, uBoil + 2.0) * step(r, 0.6));
  float a = inside * s * uStrength;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uInk, a);
}`

export function createCrayonKit(palette, { dpr = 1 } = {}) {
  const shared = {
    uPaper: { value: new THREE.Vector3(...palette.paper) },
    uInk: { value: new THREE.Vector3(...palette.ink) },
    uLight: { value: new THREE.Vector3(-0.55, 0.9, 0.7) },
    uBoil: { value: 0 },
    uDpr: { value: dpr },
  }
  const materials = []
  const track = (m) => (materials.push(m), m)

  const surface = (frag, color, shade, fluff = 0, fluffFreq = 3.2, seed = 0) =>
    track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...shared,
          uColor: { value: new THREE.Vector3(...color) },
          uShade: { value: new THREE.Vector3(...(shade || color)) },
          uFluff: { value: fluff },
          uFluffFreq: { value: fluffFreq },
          uSeed: { value: new THREE.Vector3(seed, seed * 1.7, seed * 0.3) },
        },
        vertexShader: VERT,
        fragmentShader: frag,
      }),
    )

  const hull = (thick, fluff = 0, fluffFreq = 3.2, seed = 0) =>
    track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...shared,
          uThick: { value: thick },
          uFluff: { value: fluff },
          uFluffFreq: { value: fluffFreq },
          uSeed: { value: new THREE.Vector3(seed, seed * 1.7, seed * 0.3) },
        },
        vertexShader: HULL_VERT,
        fragmentShader: HULL_FRAG,
        side: THREE.BackSide,
      }),
    )

  const kit = {
    shared,
    fur: (o = {}) => surface(FUR_FRAG, palette.fur, palette.furShade, o.fluff ?? 0, o.freq ?? 3.2, o.seed ?? 0),
    fill: (color, o = {}) => surface(FILL_FRAG, color, null, o.fluff ?? 0, o.freq ?? 3.2, o.seed ?? 0),
    ink: (color = palette.ink) => surface(INK_FRAG, color),
    hull,
    shadow: (strength = 0.55) =>
      track(
        new THREE.ShaderMaterial({
          uniforms: { ...shared, uStrength: { value: strength } },
          vertexShader: SHADOW_VERT,
          fragmentShader: SHADOW_FRAG,
          transparent: true,
          depthWrite: false,
        }),
      ),
    // A mesh drawn in crayon: the surface plus its wobbling ink outline.
    drawn(geometry, material, { thick = 0.03, outline = true } = {}) {
      const group = new THREE.Group()
      const body = new THREE.Mesh(geometry, material)
      group.add(body)
      if (outline) {
        const u = material.uniforms
        const line = new THREE.Mesh(geometry, hull(thick, u.uFluff.value, u.uFluffFreq.value, u.uSeed.value.x))
        group.add(line)
      }
      group.userData.body = body
      return group
    },
    setBoil(v) { shared.uBoil.value = v },
    setDpr(v) { shared.uDpr.value = v },
    dispose() { materials.forEach((m) => m.dispose()) },
  }
  return kit
}
