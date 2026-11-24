import * as THREE from 'three'

const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))

export function makeBone(kit, material, size = 1) {
  const g = new THREE.Group()
  const shaft = kit.drawn(new THREE.CapsuleGeometry(0.09 * size, 0.62 * size, 6, 14), material, { thick: 0.022 * size })
  shaft.rotation.z = Math.PI / 2
  g.add(shaft)
  for (const [x, y] of [[-0.42, 0.1], [-0.42, -0.1], [0.42, 0.1], [0.42, -0.1]]) {
    const knob = kit.drawn(new THREE.SphereGeometry(0.13 * size, 18, 12), material, { thick: 0.022 * size })
    knob.position.set(x * size, y * size, 0)
    g.add(knob)
  }
  return g
}

// Shero: an original fluffy white pup with a red collar and a yellow bone tag.
// Built from primitives so every part can be posed, and drawn with the crayon kit.
export function createShero(kit, palette) {
  const root = new THREE.Group()
  const rig = new THREE.Group()
  root.add(rig)

  const furBody = kit.fur({ fluff: 0.17, freq: 2.9, seed: 1 })
  const furHead = kit.fur({ fluff: 0.08, freq: 3.4, seed: 4 })
  const furSmall = kit.fur({ fluff: 0.05, freq: 5, seed: 7 })
  const furTail = kit.fur({ fluff: 0.24, freq: 4.3, seed: 9 })
  const ink = kit.ink()
  const glint = kit.ink(palette.paper)
  const red = kit.fill(palette.red)
  const yellow = kit.fill(palette.yellow)
  const pink = kit.fill(mixRgb(palette.red, palette.paper, 0.45))
  const sphere = (r, w = 48, h = 32) => new THREE.SphereGeometry(r, w, h)

  const body = kit.drawn(sphere(0.62), furBody, { thick: 0.036 })
  body.position.set(0, 0.66, -0.05)
  body.scale.set(0.95, 0.86, 1.16)
  rig.add(body)

  const legGeo = new THREE.CapsuleGeometry(0.13, 0.2, 6, 16)
  const legs = [[-0.3, 0.36], [0.3, 0.36], [-0.3, -0.44], [0.3, -0.44]].map(([x, z]) => {
    const hip = new THREE.Group()
    hip.position.set(x, 0.42, z)
    const leg = kit.drawn(legGeo, furSmall, { thick: 0.026 })
    leg.position.y = -0.2
    hip.add(leg)
    rig.add(hip)
    return hip
  })

  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.9, -0.66)
  const tail = kit.drawn(sphere(0.2), furTail, { thick: 0.03 })
  tail.position.set(0, 0.1, -0.1)
  tailPivot.add(tail)
  rig.add(tailPivot)

  const headPivot = new THREE.Group()
  headPivot.position.set(0, 1.02, 0.34)
  rig.add(headPivot)
  const head = kit.drawn(sphere(0.56), furHead, { thick: 0.036 })
  head.position.set(0, 0.27, 0.12)
  head.scale.set(1.06, 0.94, 0.96)
  headPivot.add(head)
  const snout = kit.drawn(sphere(0.23), furSmall, { thick: 0.026 })
  snout.position.set(0, 0.12, 0.63)
  snout.scale.set(1.15, 0.8, 0.9)
  headPivot.add(snout)
  const nose = new THREE.Mesh(sphere(0.075, 24, 16), ink)
  nose.position.set(0, 0.2, 0.84)
  nose.scale.set(1.25, 0.85, 1)
  headPivot.add(nose)

  const eyes = [-0.21, 0.21].map((x) => {
    const eye = new THREE.Group()
    eye.position.set(x, 0.37, 0.655)
    const ball = new THREE.Mesh(sphere(0.07, 24, 16), ink)
    ball.scale.set(0.9, 1.18, 0.55)
    const shine = new THREE.Mesh(sphere(0.021, 12, 8), glint)
    shine.position.set(0.022, 0.034, 0.035)
    eye.add(ball, shine)
    headPivot.add(eye)
    return eye
  })

  const mouth = new THREE.Group()
  const arc = new THREE.TorusGeometry(0.042, 0.01, 6, 16, Math.PI)
  for (const x of [-0.042, 0.042]) {
    const m = new THREE.Mesh(arc, ink)
    m.position.set(x, 0.045, 0.81)
    m.rotation.z = Math.PI
    mouth.add(m)
  }
  headPivot.add(mouth)
  const tongue = kit.drawn(sphere(0.075, 16, 12), pink, { thick: 0.014 })
  tongue.position.set(0, -0.02, 0.78)
  tongue.scale.set(1, 0.55, 0.7)
  tongue.visible = false
  headPivot.add(tongue)

  const ears = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.5 * s, 0.5, 0.04)
    const ear = kit.drawn(sphere(0.18, 24, 16), furSmall, { thick: 0.028 })
    ear.scale.set(0.7, 1.3, 0.45)
    ear.position.set(0, -0.15, 0)
    pivot.add(ear)
    pivot.userData.side = s
    headPivot.add(pivot)
    return pivot
  })

  const collar = kit.drawn(new THREE.TorusGeometry(0.47, 0.075, 10, 48), red, { thick: 0.02 })
  collar.position.set(0, 0.97, 0.32)
  collar.rotation.x = Math.PI / 2 - 0.5
  rig.add(collar)
  const tag = makeBone(kit, yellow, 0.24)
  tag.position.set(0.2, 0.82, 0.74)
  tag.rotation.set(-0.35, 0, 0.3)
  rig.add(tag)
  // A little round bell beside the tag, with its slot drawn on.
  const bell = kit.drawn(sphere(0.085, 20, 14), yellow, { thick: 0.016 })
  bell.position.set(-0.12, 0.78, 0.78)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.02), ink)
  slot.position.set(-0.12, 0.75, 0.86)
  rig.add(bell, slot)

  const socket = new THREE.Group()
  socket.position.set(0, 0.06, 0.88)
  headPivot.add(socket)

  const st = {
    t: 0, lookX: 0, lookY: 0, tx: 0, ty: 0,
    happy: 0, perk: 0, sniff: 0, run: 0, runTarget: 0, phase: 0,
    blinkAt: 1.8, blink: 0, hop: 0, spinVel: 0, curl: 0, curlTarget: 0, sit: 0,
    beg: 0, begUntil: 0, eat: 0, eatUntil: 0,
  }

  function update(dt) {
    st.t += dt
    const t = st.t
    if (t > st.blinkAt) { st.blink = 0.13; st.blinkAt = t + 2.4 + Math.random() * 3.6 }
    st.blink = Math.max(0, st.blink - dt)
    st.happy = Math.max(0, st.happy - dt * 0.32)
    st.perk = Math.max(0, st.perk - dt * 0.7)
    st.sniff = Math.max(0, st.sniff - dt * 0.9)
    st.run = damp(st.run, st.runTarget, 7, dt)
    st.curl = damp(st.curl, st.curlTarget, 5, dt)
    st.beg = damp(st.beg, t < st.begUntil ? 1 : 0, 6, dt)
    st.eat = damp(st.eat, t < st.eatUntil ? 1 : 0, 8, dt)

    st.lookX = damp(st.lookX, st.tx, 6, dt)
    st.lookY = damp(st.lookY, st.ty, 6, dt)
    headPivot.rotation.y = st.lookX * 0.65
    headPivot.rotation.x = -st.lookY * 0.32 + st.sniff * 0.42 + Math.sin(t * 28) * 0.035 * st.sniff
      + st.eat * (0.75 + Math.sin(t * 13) * 0.18) - st.beg * 0.25
    headPivot.rotation.z = st.lookX * -0.12 + Math.sin(t * 1.3) * 0.03 * (1 - st.run)

    const squint = st.happy > 0.3 ? 0.32 : 1
    eyes.forEach((e) => { e.scale.y = st.blink > 0 ? 0.12 : squint })
    tongue.visible = st.happy > 0.3 || st.run > 0.45
    mouth.visible = !tongue.visible

    ears.forEach((p) => {
      const s = p.userData.side
      p.rotation.z = s * (0.62 - st.perk * 0.7) + Math.sin(st.phase) * 0.25 * st.run * s
      p.rotation.x = -0.15 - st.run * 0.6 + st.perk * 0.2
    })

    const wagRate = 7 + st.happy * 16 + st.run * 6
    tailPivot.rotation.y = Math.sin(t * wagRate) * (0.35 + st.happy * 0.35)
    tailPivot.rotation.x = -0.3 - st.happy * 0.3

    body.scale.y = 0.86 * (1 + Math.sin(t * 2.2) * 0.012 * (1 - st.run))

    st.phase += dt * 15 * st.run
    const swing = Math.sin(st.phase) * 0.85 * st.run
    legs[0].rotation.x = swing
    legs[3].rotation.x = swing
    legs[1].rotation.x = -swing
    legs[2].rotation.x = -swing

    st.hop = Math.max(0, st.hop - dt * 2.6)
    const hopY = Math.sin(Math.min(1, 1 - st.hop) * Math.PI) * 0.35 * (st.hop > 0 ? 1 : 0)
    rig.position.y = Math.abs(Math.sin(st.phase)) * 0.13 * st.run + hopY + st.beg * 0.18
    rig.rotation.x = st.run * 0.12 - st.beg * 0.5
    // Begging: sat back on his hind legs, front paws paddling up and down.
    if (st.beg > 0.02) {
      const paddle = Math.sin(t * 9) * 0.45 * st.beg
      legs[0].rotation.x = -1.3 * st.beg + paddle
      legs[1].rotation.x = -1.3 * st.beg - paddle
      legs[2].rotation.x = legs[3].rotation.x = 1.0 * st.beg
    }

    // Curl: the cotton-ball trick, a ball of fluff that rolls.
    // Head, ears and legs tuck in so he becomes one round puff.
    const c = st.curl
    rig.scale.set(1 + c * 0.04, 1 - c * 0.38, 1 - c * 0.34)
    legs.forEach((l) => { l.visible = c < 0.5 })
    ears.forEach((p) => { p.visible = c < 0.6 })
    tailPivot.visible = c < 0.6
    collar.visible = tag.visible = bell.visible = slot.visible = c < 0.6
    headPivot.position.y = 1.02 - c * 0.62
    headPivot.position.z = 0.34 - c * 0.3

    st.scratch = damp(st.scratch || 0, t < (st.scratchUntil || 0) ? 1 : 0, 10, dt)
    if (st.scratch > 0.05) {
      headPivot.rotation.z = 0.35 * st.scratch
      legs[3].rotation.x = -1.2 * st.scratch + Math.sin(t * 22) * 0.3 * st.scratch
      legs[3].rotation.z = 0.5 * st.scratch
    }

    root.rotation.y += st.spinVel * dt
    st.spinVel *= Math.exp(-dt * 2.6)
  }

  return {
    root, rig, headPivot, socket, state: st, update,
    lookAt(x, y) { st.tx = Math.max(-1, Math.min(1, x)); st.ty = Math.max(-1, Math.min(1, y)) },
    pet() { st.happy = Math.min(1.4, st.happy + 0.6); st.hop = 1 },
    perk() { st.perk = 1 },
    sniff() { st.sniff = 1.4 },
    spin(v) { st.spinVel += v },
    setRunning(on) { st.runTarget = on ? 1 : 0 },
    setCurl(on) { st.curlTarget = on ? 1 : 0 },
    beg(seconds = 2.6) { st.begUntil = st.t + seconds; st.happy = Math.max(st.happy, 0.8) },
    eat(seconds = 2.2) { st.eatUntil = st.t + seconds },
    scratch(seconds = 2.0) { st.scratchUntil = st.t + seconds },
  }
}
