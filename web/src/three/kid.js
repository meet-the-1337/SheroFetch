import * as THREE from 'three'

// Shinnosuke "Shinchan" Nohara: 2.5 heads tall with his iconic squishy cheeks,
// thick bushy caterpillar eyebrows, wide mischievous grin, red t-shirt,
// yellow shorts, and signature Buri-Buri boogie (ケツだけ星人).
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

export function createKid(kit, palette) {
  const root = new THREE.Group()
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
  const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h)
  const skin = kit.fill(mix(palette.yellow, palette.red, 0.16))
  const shirt = kit.fill(palette.red)
  const shorts = kit.fill(palette.yellow)
  const hair = kit.fill(mix(palette.ink, palette.paper, 0.05))
  const shoeMat = kit.fill(palette.yellow)
  const sockMat = kit.fill(palette.paper)
  const ink = kit.ink()

  const part = (geo, mat, x, y, z, parent = root, thick = 0.03) => {
    const m = kit.drawn(geo, mat, { thick })
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }

  // Legs & Shoes (yellow shoes, white socks, yellow shorts)
  const legs = [-0.22, 0.22].map((x) => {
    const hip = new THREE.Group()
    hip.position.set(x, 0.88, 0)
    // Yellow shorts leg
    part(box(0.38, 0.48, 0.42), shorts, 0, -0.2, 0, hip)
    // Bare knee
    part(box(0.28, 0.28, 0.3), skin, 0, -0.52, 0, hip)
    // White sock
    part(box(0.3, 0.12, 0.32), sockMat, 0, -0.68, 0.01, hip)
    // Yellow slip-on shoe
    part(box(0.34, 0.16, 0.46), shoeMat, 0, -0.8, 0.06, hip)
    root.add(hip)
    return hip
  })

  // Torso: round little belly in the red crew-neck shirt
  const torso = new THREE.Group()
  torso.position.set(0, 1.34, 0)
  part(box(0.92, 0.82, 0.58), shirt, 0, 0, 0, torso)
  // Round neckline
  const neck = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16, Math.PI, Math.PI), skin)
  neck.position.set(0, 0.41, 0.292)
  torso.add(neck)
  root.add(torso)

  // Arms: red short sleeve + bare chubby arm + rounded hand
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group()
    sh.position.set(s * 0.62, 1.66, 0)
    // Short sleeve
    part(box(0.34, 0.32, 0.36), shirt, 0, -0.12, 0, sh)
    // Bare arm
    part(box(0.26, 0.36, 0.28), skin, 0, -0.42, 0, sh)
    // Round fist / hand
    part(box(0.28, 0.22, 0.3), skin, 0, -0.68, 0, sh)
    root.add(sh)
    return sh
  })

  // Head: Shinchan's iconic pear/potato contour with bulging squishy cheeks
  const head = new THREE.Group()
  head.position.set(0, 1.82, 0)

  // Main skull
  part(box(0.86, 0.78, 0.74), skin, 0, 0.4, 0, head, 0.035)

  // Squishy chubby cheeks that give Shinchan his signature manga silhouette
  for (const s of [-1, 1]) {
    const cheekBulge = part(sphere(0.26, 16, 12), skin, s * 0.44, 0.28, 0.12, head, 0.02)
    cheekBulge.scale.set(0.9, 1.1, 0.9)
  }

  // Cropped black buzz-cut hair
  part(box(0.9, 0.18, 0.8), hair, 0, 0.82, -0.01, head, 0.025)
  part(box(0.9, 0.52, 0.14), hair, 0, 0.58, -0.37, head, 0.02)
  for (const x of [-0.32, -0.16, 0, 0.16, 0.32]) {
    const tuft = part(box(0.11, 0.13, 0.11), hair, x, 0.94, 0.12 - Math.abs(x) * 0.35, head, 0.012)
    tuft.rotation.z = x * 0.8
  }

  // The Defining Feature: Thick bushy arched caterpillar eyebrows!
  const brows = [-1, 1].map((s) => {
    const bg = new THREE.Group()
    bg.position.set(s * 0.23, 0.62, 0.38)
    const m = new THREE.Mesh(box(0.26, 0.1, 0.04), ink)
    m.rotation.z = s * -0.16
    bg.add(m)
    head.add(bg)
    return bg
  })

  // Big expressive anime eyes: white sclera + black pupils + white glint
  const eyes = [-1, 1].map((s) => {
    const eye = new THREE.Group()
    eye.position.set(s * 0.2, 0.45, 0.38)

    // White sclera
    const sclera = new THREE.Mesh(box(0.17, 0.18, 0.02), kit.fill(palette.paper))
    eye.add(sclera)

    // Black pupil
    const pupil = new THREE.Mesh(box(0.1, 0.14, 0.03), ink)
    pupil.position.set(s * -0.01, -0.01, 0.01)
    eye.add(pupil)

    // Sparkle / Glint
    const glint = new THREE.Mesh(box(0.04, 0.04, 0.035), kit.ink(palette.paper))
    glint.position.set(s * 0.025, 0.035, 0.015)
    eye.add(glint)

    head.add(eye)
    return eye
  })

  // Wide mischievous cartoon grin
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16, Math.PI, Math.PI), ink)
  mouth.position.set(0, 0.24, 0.382)
  head.add(mouth)

  // Rosy cheeks
  for (const s of [-1, 1]) {
    const blush = new THREE.Mesh(box(0.16, 0.08, 0.02), kit.ink(mix(palette.red, palette.paper, 0.4)))
    blush.position.set(s * 0.36, 0.3, 0.382)
    head.add(blush)
  }

  root.add(head)

  const st = {
    t: 0,
    wave: 0,
    dance: 0,
    action: 0,
    walk: 0,
    phase: 0,
    blink: 0,
    blinkAt: 2.0,
  }

  return {
    root,
    head,
    torso,
    wave() { st.wave = 1.8 },
    dance() { st.dance = 3.6 },
    actionPose() { st.action = 2.4 },
    setWalking(on) { st.walk = on ? 1 : 0 },
    update(dt) {
      st.t += dt
      st.wave = Math.max(0, st.wave - dt)
      st.dance = Math.max(0, st.dance - dt)
      st.action = Math.max(0, st.action - dt)

      // Eye blinking
      if (st.t > st.blinkAt) { st.blink = 0.12; st.blinkAt = st.t + 2.5 + Math.random() * 3 }
      st.blink = Math.max(0, st.blink - dt)
      eyes.forEach((e) => { e.scale.y = st.blink > 0 ? 0.15 : 1 })

      // Walking swing
      st.phase += dt * 10 * st.walk
      const swing = Math.sin(st.phase) * 0.7 * st.walk
      legs[0].rotation.x = swing
      legs[1].rotation.x = -swing
      arms[0].rotation.x = -swing
      arms[1].rotation.x = swing

      // Eyebrow comedic bounce
      const browBounce = Math.sin(st.t * 3.5) * 0.025
      brows[0].position.y = 0.62 + browBounce
      brows[1].position.y = 0.62 - browBounce * 0.5

      // Wave animation
      if (st.wave > 0) {
        arms[1].rotation.z = 2.5 + Math.sin(st.t * 14) * 0.35
        arms[1].rotation.x = 0
      } else if (st.dance === 0 && st.action === 0) {
        arms[1].rotation.z *= Math.exp(-dt * 8)
      }

      // Action Kamen superhero stance
      if (st.action > 0) {
        head.rotation.y = 0
        head.rotation.x = 0.2
        arms[0].rotation.set(0, 0, -1.8)
        arms[1].rotation.set(0, 0, 2.4)
        root.rotation.y = 0
        return
      }

      // Authentic Buri-Buri Boogie (ケツだけ星人)!
      // Turns around 180°, leans torso forward, and wiggles hips side to side at high frequency!
      if (st.dance > 0) {
        // Turn around to show his rear
        root.rotation.y = Math.PI + Math.sin(st.t * 18) * 0.12
        // Lean forward
        torso.rotation.x = 0.45
        head.rotation.x = -0.3
        head.rotation.y = Math.sin(st.t * 18) * 0.15
        // Vigorously shake hips/rear left and right
        const wiggle = Math.sin(st.t * 20) * 0.38
        root.rotation.z = wiggle
        root.position.x += Math.cos(st.t * 20) * 0.004
        root.position.y = Math.abs(Math.sin(st.t * 20)) * 0.08
        // Hands on hips / knees
        arms[0].rotation.set(0.5, 0, -1.0)
        arms[1].rotation.set(0.5, 0, 1.0)
        legs[0].rotation.x = 0.3 + Math.sin(st.t * 20) * 0.15
        legs[1].rotation.x = 0.3 - Math.sin(st.t * 20) * 0.15
      } else {
        // Return smoothly to idle
        root.rotation.y *= Math.exp(-dt * 6)
        root.rotation.z *= Math.exp(-dt * 8)
        torso.rotation.x *= Math.exp(-dt * 8)
        head.rotation.x *= Math.exp(-dt * 8)
        head.rotation.y = Math.sin(st.t * 0.9) * 0.12
        torso.position.y = 1.34 + Math.sin(st.t * 2.4) * 0.015
      }
    },
  }
}
