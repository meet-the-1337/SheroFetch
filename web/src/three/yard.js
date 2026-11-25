import * as THREE from 'three'

// Shero's street, drawn in crayon: a two-storey family house with laundry on the balcony,
// a concrete block wall with a gate, a telephone pole with sagging wires, and his own
// doghouse with a name board. All original shapes in the look of a Saitama suburb.

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

function nameBoard(text, palette) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')
  const rgb = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`
  g.fillStyle = rgb(palette.fur)
  g.fillRect(0, 0, 512, 160)
  g.strokeStyle = rgb(palette.ink)
  g.lineWidth = 14
  g.strokeRect(10, 10, 492, 140)
  g.fillStyle = rgb(palette.ink)
  g.font = '96px "Darumadrop One", "Zen Maru Gothic", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 88)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36), new THREE.MeshBasicMaterial({ map: tex })), tex }
}

function gable(w, h, d) {
  // A triangular prism lying along x: the pitched roof.
  const shape = new THREE.Shape()
  shape.moveTo(-d / 2, 0)
  shape.lineTo(d / 2, 0)
  shape.lineTo(0, h)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false })
  geo.rotateY(Math.PI / 2)
  geo.translate(-w / 2, 0, 0)
  geo.computeVertexNormals()
  return geo
}

function noharaPlate(palette) {
  const c = document.createElement('canvas')
  c.width = 160
  c.height = 420
  const g = c.getContext('2d')
  const rgb = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`
  // Clean wooden plaque
  g.fillStyle = rgb(palette.paper)
  g.fillRect(0, 0, 160, 420)
  g.strokeStyle = rgb(palette.ink)
  g.lineWidth = 10
  g.strokeRect(6, 6, 148, 408)
  // Kanji: 野原 (Nohara)
  g.fillStyle = rgb(palette.ink)
  g.font = 'bold 110px "Zen Maru Gothic", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('野', 80, 130)
  g.fillText('原', 80, 275)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.78), new THREE.MeshBasicMaterial({ map: tex })), tex }
}

function chocobiTexture(palette) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')
  const rgb = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`
  g.fillStyle = rgb(mix(palette.blue, palette.yellow, 0.58))
  g.fillRect(0, 0, 512, 256)
  // Waniyama-san (Pink Dinosaur) face
  g.fillStyle = rgb(mix(palette.red, palette.paper, 0.42))
  g.beginPath()
  g.arc(256, 115, 78, 0, Math.PI * 2)
  g.fill()
  // Sharp white teeth
  g.fillStyle = rgb(palette.paper)
  for (let x = 205; x <= 295; x += 18) {
    g.beginPath()
    g.moveTo(x, 125); g.lineTo(x + 9, 148); g.lineTo(x + 18, 125); g.fill()
  }
  // Eyes
  g.fillStyle = rgb(palette.ink)
  g.beginPath(); g.arc(232, 100, 14, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.arc(280, 100, 14, 0, Math.PI * 2); g.fill()
  g.fillStyle = rgb(palette.paper)
  g.beginPath(); g.arc(235, 96, 5, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.arc(283, 96, 5, 0, Math.PI * 2); g.fill()
  // Japanese text: チョコビ
  g.fillStyle = rgb(palette.yellow)
  g.font = 'bold 44px "Darumadrop One", sans-serif'
  g.textAlign = 'center'
  g.fillText('チョコビ', 256, 225)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// The living room of the family house: low table, sofa, a TV that shows what Shero is
// fetching, a window onto the evening, and a box of crayons left on the floor.
export function createRoom(kit, palette) {
  const root = new THREE.Group()
  const disposables = []
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
  const wallMat = kit.fill(mix(palette.paper, palette.yellow, 0.22))
  const floorMat = kit.fill(mix(palette.paper, palette.yellow, 0.5))
  const wood = kit.fill(mix(palette.red, palette.yellow, 0.55))
  const red = kit.fill(palette.red)
  const blue = kit.fill(palette.blue)
  const yellow = kit.fill(palette.yellow)
  const ink = kit.ink()
  const add = (o, x, y, z) => { o.position.set(x, y, z); root.add(o); return o }

  // Walls run past the top of the view and the floor runs under the camera, so the room fills
  // the frame like a dollhouse with its front wall taken off.
  add(kit.drawn(box(12, 0.2, 22), floorMat, { thick: 0.03 }), 0, -0.1, 6.5)
  add(kit.drawn(box(12, 9, 0.2), wallMat, { thick: 0.04 }), 0, 4.5, -4.5)
  add(kit.drawn(box(0.2, 9, 22), wallMat, { thick: 0.04 }), -6, 4.5, 6.5)
  add(kit.drawn(box(0.2, 9, 22), wallMat, { thick: 0.04 }), 6, 4.5, 6.5)
  // Skirting board where the walls meet the floor.
  add(new THREE.Mesh(box(12, 0.18, 0.06), kit.ink(mix(palette.red, palette.ink, 0.35))), 0, 0.09, -4.38)
  // Six tatami mats, each edged on its long sides with dark green cloth tape.
  const matMat = kit.fill(mix(mix(palette.paper, palette.yellow, 0.55), palette.blue, 0.12))
  const tape = kit.ink(mix(mix(palette.blue, palette.yellow, 0.5), palette.ink, 0.55))
  for (const x0 of [-5.4, 0]) for (const z0 of [-4.3, -1.6, 1.1]) {
    add(kit.drawn(box(5.36, 0.06, 2.66), matMat, { thick: 0.012 }), x0 + 2.7, 0.03, z0 + 1.35)
    for (const dz of [0.06, 2.6]) add(new THREE.Mesh(box(5.36, 0.07, 0.11), tape), x0 + 2.7, 0.035, z0 + dz)
  }

  // Sliding closet doors on the back wall, papered with a soft cloud pattern.
  const cc = document.createElement('canvas')
  cc.width = 256
  cc.height = 256
  const cg = cc.getContext('2d')
  const rgbc = (v, a = 1) => `rgba(${v.map((x) => Math.round(x * 255)).join(',')},${a})`
  cg.fillStyle = rgbc(mix(palette.paper, palette.yellow, 0.12))
  cg.fillRect(0, 0, 256, 256)
  cg.strokeStyle = rgbc(mix(palette.blue, palette.paper, 0.45), 0.6)
  cg.lineWidth = 5
  for (const [cx, cy] of [[60, 70], [190, 150], [80, 210]]) {
    cg.beginPath()
    for (let k = 0; k < 4; k++) cg.arc(cx + k * 22, cy - (k % 2) * 10, 16, Math.PI, 0)
    cg.stroke()
  }
  const cloudTex = new THREE.CanvasTexture(cc)
  cloudTex.colorSpace = THREE.SRGBColorSpace
  disposables.push(cloudTex)
  for (const [i, x] of [-4.6, -2.8].entries()) {
    const panel = new THREE.Mesh(box(1.85, 3.2, 0.06), new THREE.MeshBasicMaterial({ map: cloudTex }))
    disposables.push(panel.material)
    panel.position.set(x, 1.65, -4.34 + i * 0.05)
    root.add(panel)
    for (const y of [0.04, 3.26]) add(new THREE.Mesh(box(1.85, 0.08, 0.1), ink), x, y, -4.3 + i * 0.05)
    add(new THREE.Mesh(box(0.06, 3.2, 0.1), ink), x - 0.92, 1.65, -4.3 + i * 0.05)
    add(new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), ink), x + (i ? -0.7 : 0.7), 1.6, -4.26 + i * 0.05)
  }
  // Window on the back wall, sky behind it.
  add(kit.drawn(box(2.8, 1.8, 0.1), kit.fill(mix(palette.blue, palette.paper, 0.55)), { thick: 0.04 }), 2.4, 2.4, -4.38)
  add(new THREE.Mesh(box(0.06, 1.8, 0.14), ink), 2.4, 2.4, -4.35)

  // Low round Chabudai table with Chocobi snack box and green teapot.
  const chabudai = add(kit.drawn(new THREE.CylinderGeometry(1.2, 1.2, 0.14, 32), wood, { thick: 0.035 }), -0.4, 0.62, 0.6)
  for (const [x, z] of [[-0.8, 0.2], [0, 0.2], [-0.8, 1.0], [0, 1.0]]) add(kit.drawn(box(0.1, 0.55, 0.1), wood, { thick: 0.02 }), -0.4 + x * 0.9 + 0.36, 0.28, z)

  // Two square Zabuton tatami cushions
  const zabuton1 = add(kit.drawn(box(0.9, 0.08, 0.9), kit.fill(mix(palette.blue, palette.red, 0.45)), { thick: 0.02 }), -0.4, 0.04, 1.6)
  const zabuton2 = add(kit.drawn(box(0.9, 0.08, 0.9), yellow, { thick: 0.02 }), -1.5, 0.04, 0.6)
  zabuton1.rotation.y = 0.15
  zabuton2.rotation.y = -0.2

  // The Iconic Six-sided Chocobi snack box with Waniyama-san dinosaur face
  const chocTex = chocobiTexture(palette)
  disposables.push(chocTex)
  const chocGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.44, 6)
  const chocMat = new THREE.MeshBasicMaterial({ map: chocTex })
  disposables.push(chocGeo, chocMat)
  const snack = add(new THREE.Mesh(chocGeo, chocMat), -0.75, 0.91, 0.45)
  snack.rotation.y = 0.4
  const snackLid = add(kit.drawn(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 6), yellow, { thick: 0.015 }), -0.75, 1.15, 0.45)
  snackLid.rotation.y = 0.4

  // Green Japanese teapot (kyusu)
  const green = kit.fill(mix(palette.blue, palette.yellow, 0.55))
  const pot = new THREE.Group()
  pot.add(kit.drawn(new THREE.SphereGeometry(0.24, 20, 14).scale(1, 0.82, 1), green, { thick: 0.02 }))
  const lid = kit.drawn(new THREE.CylinderGeometry(0.1, 0.13, 0.07, 14), green, { thick: 0.012 })
  lid.position.y = 0.2
  const spout = kit.drawn(new THREE.CylinderGeometry(0.035, 0.06, 0.28, 8), green, { thick: 0.012 })
  spout.position.set(0.25, 0.04, 0)
  spout.rotation.z = -0.9
  pot.add(lid, spout)
  pot.position.set(0.05, 0.9, 0.85)
  root.add(pot)

  // Action Kamen comic book lying on the tatami floor
  const comic = new THREE.Group()
  comic.add(kit.drawn(box(0.55, 0.03, 0.75), red, { thick: 0.012 }))
  const comicCover = new THREE.Mesh(box(0.52, 0.035, 0.72), kit.fill(mix(palette.yellow, palette.paper, 0.5)))
  comic.add(comicCover)
  comic.position.set(-1.4, 0.02, 2.1)
  comic.rotation.y = 0.45
  root.add(comic)

  // Side stand with retro rotary telephone
  const phoneStand = add(kit.drawn(box(0.9, 0.8, 0.7), wood, { thick: 0.03 }), -5.2, 0.4, -3.6)
  const phoneBase = kit.drawn(box(0.36, 0.16, 0.36), green, { thick: 0.015 })
  phoneBase.position.set(-5.2, 0.88, -3.6)
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), kit.fill(palette.paper))
  dial.position.set(-5.2, 0.97, -3.55)
  dial.rotation.x = -Math.PI / 2 + 0.3
  root.add(phoneBase, dial)

  // Sofa along the left wall.
  const sofa = new THREE.Group()
  const seat = kit.drawn(box(1.2, 0.55, 3.4), red, { thick: 0.04 })
  seat.position.y = 0.28
  sofa.add(seat)
  const back = kit.drawn(box(0.35, 1.0, 3.4), red, { thick: 0.04 })
  back.position.set(-0.45, 0.8, 0)
  sofa.add(back)
  sofa.position.set(-4.1, 0, 0.2)
  root.add(sofa)

  // TV on a stand in the right corner, its screen a canvas we can write on.
  add(kit.drawn(box(1.8, 0.7, 0.8), wood, { thick: 0.035 }), 3.4, 0.35, -2.6)
  // A wood-cased tube TV with a knob panel and rabbit-ear antennas.
  add(kit.drawn(box(2.3, 1.5, 1.1), wood, { thick: 0.045 }), 3.55, 1.45, -2.85)
  add(kit.drawn(box(0.42, 1.2, 0.05), kit.fill(mix(palette.ink, palette.paper, 0.3)), { thick: 0.015 }), 4.45, 1.45, -2.28)
  for (const y of [1.75, 1.3]) {
    const knob = add(kit.drawn(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16).rotateX(Math.PI / 2), kit.fill(palette.paper), { thick: 0.012 }), 4.45, y, -2.23)
    knob.rotation.z = y
  }
  for (const s of [-1, 1]) {
    const ant = add(kit.drawn(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 6), kit.fill(palette.paper), { thick: 0.008 }), 3.55 + s * 0.35, 2.75, -2.9)
    ant.rotation.z = -s * 0.5
  }
  add(kit.drawn(new THREE.SphereGeometry(0.16, 14, 10).scale(1.4, 0.6, 1), kit.fill(mix(palette.ink, palette.paper, 0.3)), { thick: 0.012 }), 3.55, 2.25, -2.9)
  const sc = document.createElement('canvas')
  sc.width = 512
  sc.height = 320
  const tex = new THREE.CanvasTexture(sc)
  tex.colorSpace = THREE.SRGBColorSpace
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.15), new THREE.MeshBasicMaterial({ map: tex }))
  screen.position.set(3.32, 1.45, -2.28)
  root.add(screen)
  disposables.push(tex, screen.material, screen.geometry)
  const rgb = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`
  const setScreen = (top, line, show) => {
    const g = sc.getContext('2d')
    g.fillStyle = rgb(show ? palette.red : palette.blue)
    g.fillRect(0, 0, 512, 320)
    if (show) {
      // Action Kamen (Action Mask) striking his victory pose with Action Beam!
      g.strokeStyle = rgb(palette.yellow)
      g.lineWidth = 12
      for (let k = 0; k < 12; k++) {
        g.beginPath()
        g.moveTo(256, 160)
        g.lineTo(256 + Math.cos(k * 0.55) * 450, 160 + Math.sin(k * 0.55) * 450)
        g.stroke()
      }
      // Superhero green/blue suit
      g.fillStyle = rgb(mix(palette.blue, palette.yellow, 0.6))
      g.fillRect(224, 125, 64, 110)
      // Yellow belt
      g.fillStyle = rgb(palette.yellow)
      g.fillRect(220, 185, 72, 18)
      // Masked head
      g.beginPath(); g.arc(256, 95, 38, 0, Math.PI * 2); g.fill()
      // Yellow eye visors
      g.fillStyle = rgb(palette.yellow)
      g.fillRect(224, 85, 26, 14)
      g.fillRect(262, 85, 26, 14)
      // Red crest
      g.fillStyle = rgb(palette.red)
      g.beginPath(); g.moveTo(256, 50); g.lineTo(246, 75); g.lineTo(266, 75); g.fill()
      // Arm shooting Action Beam
      g.fillStyle = rgb(mix(palette.blue, palette.yellow, 0.6))
      g.beginPath(); g.moveTo(280, 135); g.lineTo(390, 60); g.lineTo(405, 78); g.lineTo(290, 160); g.fill()
      // Comic text: ACTION BEAM!
      g.fillStyle = rgb(palette.yellow)
      g.font = 'bold 36px "Darumadrop One", sans-serif'
      g.textAlign = 'center'
      g.fillText('アクションビーム！', 256, 280)
    }
    // a faint scanline wash, like an old tube set
    g.fillStyle = 'rgba(0,0,0,0.07)'
    for (let y = 0; y < 320; y += 6) g.fillRect(0, y, 512, 2)
    g.fillStyle = rgb(palette.paper)
    g.textAlign = 'center'
    g.font = '40px "Zen Maru Gothic", sans-serif'
    g.fillText(top, 256, show ? 44 : 120)
    g.font = '64px "Darumadrop One", "Zen Maru Gothic", sans-serif'
    g.fillText(line.length > 14 ? line.slice(0, 13) + '…' : line, 256, show ? 296 : 210)
    tex.needsUpdate = true
  }
  setScreen('Channel Shero', 'Kya sunoge?')

  // A box of crayons someone left on the floor.
  const crayons = new THREE.Group()
  crayons.add(kit.drawn(box(0.9, 0.12, 0.5), yellow, { thick: 0.02 }))
  ;[palette.red, palette.blue, palette.yellow, palette.ink].forEach((c, i) => {
    const s = kit.drawn(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8).rotateZ(Math.PI / 2), kit.fill(c), { thick: 0.015 })
    s.position.set(0, 0.11, -0.16 + i * 0.11)
    crayons.add(s)
  })
  crayons.position.set(1.6, 0.06, 2.4)
  crayons.rotation.y = -0.5
  root.add(crayons)

  // A cushion where Shero lies when he comes in.
  add(kit.drawn(new THREE.CylinderGeometry(0.8, 0.85, 0.18, 24), blue, { thick: 0.03 }), 1.9, 0.09, 0.4)

  return {
    root, tv: screen, sofa, snack, pot, comic, phone: phoneBase, crayons, setScreen,
    tableWorld: () => chabudai.getWorldPosition(new THREE.Vector3()),
    tvWorld: () => screen.getWorldPosition(new THREE.Vector3()),
    spot: new THREE.Vector3(1.9, 0.18, 0.4),
    dispose() { disposables.forEach((d) => d.dispose()) },
  }
}

export function createYard(kit, palette) {
  const root = new THREE.Group()
  const disposables = []
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
  const cream = kit.fill(mix(palette.paper, palette.yellow, 0.28))
  const wallGrey = kit.fill(mix(palette.paper, palette.muted, 0.32))
  const houseRoofMat = kit.fill(mix(palette.red, palette.yellow, 0.35))
  const dogRoofMat = kit.fill(palette.blue)
  const red = kit.fill(palette.red)
  const yellow = kit.fill(palette.yellow)
  const wood = kit.fill(mix(palette.red, palette.yellow, 0.55))
  const ink = kit.ink()
  const white = kit.fur({ fluff: 0 })

  // The ground: the yard in front of the wall, the lane behind it.
  const yardGround = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), kit.fill(mix(palette.paper, palette.yellow, 0.12)))
  yardGround.rotation.x = -Math.PI / 2
  yardGround.position.set(0, -0.002, -12)
  root.add(yardGround)

  // The family house, set back behind the wall.
  const house = new THREE.Group()
  const ground = kit.drawn(box(7.2, 2.9, 4.4), cream, { thick: 0.05 })
  ground.position.y = 1.45
  const upper = kit.drawn(box(5.4, 2.5, 4.0), cream, { thick: 0.05 })
  upper.position.set(-0.6, 4.15, -0.1)
  const roof = kit.drawn(gable(6.2, 1.5, 4.9), houseRoofMat, { thick: 0.05 })
  roof.position.set(-0.6, 5.4, -0.1)
  const eave = kit.drawn(box(7.8, 0.22, 4.9), houseRoofMat, { thick: 0.04 })
  eave.position.set(0, 2.98, 0)
  house.add(ground, upper, roof, eave)
  // Windows lit for the evening, and the front door.
  const win = (w, h, x, y, z) => {
    const m = kit.drawn(box(w, h, 0.08), yellow, { thick: 0.035 })
    m.position.set(x, y, z)
    const bar = new THREE.Mesh(box(0.06, h, 0.1), ink)
    bar.position.set(x, y, z + 0.01)
    house.add(m, bar)
  }
  // Sliding glass doors onto a low wooden veranda along the front of the house.
  const glass = kit.fill(mix(palette.blue, palette.paper, 0.6))
  for (const [i, x] of [-2.6, -1.4, -0.2].entries()) {
    const pane = kit.drawn(box(1.15, 1.9, 0.06), glass, { thick: 0.03 })
    pane.position.set(x, 1.38, 2.21 + (i % 2) * 0.05)
    const frame = new THREE.Mesh(box(0.06, 1.9, 0.1), ink)
    frame.position.set(x + 0.56, 1.38, 2.24)
    const shine = new THREE.Mesh(box(0.05, 0.9, 0.02), kit.ink(palette.paper))
    shine.position.set(x - 0.3, 1.6, 2.27)
    shine.rotation.z = 0.35
    house.add(pane, frame, shine)
  }
  const deck = kit.drawn(box(5.2, 0.22, 1.25), wood, { thick: 0.035 })
  deck.position.set(-1.0, 0.36, 2.85)
  house.add(deck)
  for (let x = -3.4; x <= 1.41; x += 0.4) {
    const plank = new THREE.Mesh(box(0.025, 0.02, 1.2), kit.ink(mix(palette.ink, palette.paper, 0.5)))
    plank.position.set(x, 0.48, 2.85)
    house.add(plank)
  }
  for (const x of [-3.45, -1.0, 1.45]) {
    const leg = kit.drawn(box(0.16, 0.36, 0.16), wood, { thick: 0.02 })
    leg.position.set(x, 0.12, 3.35)
    house.add(leg)
  }
  const step = kit.drawn(box(0.9, 0.16, 0.45), kit.fill(mix(palette.paper, palette.muted, 0.4)), { thick: 0.025 })
  step.position.set(-1.6, 0.08, 3.7)
  house.add(step)
  win(1.5, 1.0, -1.6, 4.25, 1.92)
  win(1.2, 1.0, 0.9, 4.25, 1.92)
  const door = kit.drawn(box(1.0, 1.9, 0.1), wood, { thick: 0.035 })
  door.position.set(2.2, 0.95, 2.23)
  house.add(door)
  // Balcony rail and a laundry pole with Hiroshi's shirt, Misae's apron, and Shinchan's shirt.
  const rail = kit.drawn(box(5.4, 0.1, 0.1), white, { thick: 0.03 })
  rail.position.set(-0.6, 3.75, 2.5)
  house.add(rail)
  for (let x = -3.2; x <= 2.01; x += 0.52) {
    const post = kit.drawn(box(0.07, 0.7, 0.07), white, { thick: 0.02 })
    post.position.set(x, 3.42, 2.5)
    house.add(post)
  }
  const pole = kit.drawn(new THREE.CylinderGeometry(0.035, 0.035, 5.2, 8).rotateZ(Math.PI / 2), white, { thick: 0.02 })
  pole.position.set(-0.6, 4.9, 2.4)
  // Hiroshi's white business shirt
  const hShirt = kit.drawn(box(0.9, 0.85, 0.03), white, { thick: 0.025 })
  hShirt.position.set(-2.2, 4.45, 2.4)
  // Misae's pink apron
  const apron = kit.drawn(box(0.7, 0.8, 0.03), kit.fill(mix(palette.red, palette.paper, 0.4)), { thick: 0.025 })
  apron.position.set(-1.0, 4.48, 2.4)
  // Shinchan's little red shirt
  const sShirt = kit.drawn(box(0.5, 0.45, 0.03), red, { thick: 0.02 })
  sShirt.position.set(0.1, 4.65, 2.4)
  house.add(pole, hShirt, apron, sShirt)
  house.position.set(0.8, 0, -9)
  house.rotation.y = -0.12
  root.add(house)

  // Concrete block wall with a gap for the gate.
  const wall = new THREE.Group()
  for (const [x0, x1] of [[-14, -1.2], [1.4, 14]]) {
    const w = x1 - x0
    const seg = kit.drawn(box(w, 1.35, 0.3), wallGrey, { thick: 0.04 })
    seg.position.set((x0 + x1) / 2, 0.675, 0)
    wall.add(seg)
    for (let x = x0 + 1.1; x < x1; x += 1.1) {
      const joint = new THREE.Mesh(box(0.035, 1.3, 0.32), kit.ink(mix(palette.ink, palette.paper, 0.45)))
      joint.position.set(x, 0.675, 0)
      wall.add(joint)
    }
    const course = new THREE.Mesh(box(w, 0.035, 0.32), kit.ink(mix(palette.ink, palette.paper, 0.45)))
    course.position.set((x0 + x1) / 2, 0.68, 0)
    wall.add(course)
  }
  for (const x of [-1.2, 1.4]) {
    const post = kit.drawn(box(0.42, 1.7, 0.42), wallGrey, { thick: 0.04 })
    post.position.set(x, 0.85, 0)
    wall.add(post)
  }
  // Authentic "野原" (Nohara) wooden nameplate on the gate pillar
  const plate = noharaPlate(palette)
  plate.mesh.position.set(1.42, 1.35, 0.22)
  wall.add(plate.mesh)
  disposables.push(plate.tex, plate.mesh.material, plate.mesh.geometry)

  // A green metal gate in the gap, slightly open, and a mailbox with a slot on the post.
  const green = kit.fill(mix(palette.blue, palette.yellow, 0.55))
  const gate = new THREE.Group()
  const gw = 2.4
  for (const y of [0.18, 1.25]) {
    const bar = kit.drawn(box(gw, 0.08, 0.08), green, { thick: 0.02 })
    bar.position.set(gw / 2, y, 0)
    gate.add(bar)
  }
  for (let x = 0.05; x <= gw; x += 0.22) {
    const rod = kit.drawn(box(0.05, 1.1, 0.05), green, { thick: 0.014 })
    rod.position.set(x, 0.72, 0)
    gate.add(rod)
  }
  gate.position.set(-1.0, 0, 0.05)
  gate.rotation.y = -0.35
  wall.add(gate)
  const mailbox = new THREE.Group()
  mailbox.add(kit.drawn(box(0.5, 0.42, 0.3), red, { thick: 0.025 }))
  const mslot = new THREE.Mesh(box(0.3, 0.04, 0.02), ink)
  mslot.position.set(0, 0.08, 0.16)
  mailbox.add(mslot)
  mailbox.position.set(1.4, 1.45, 0.3)
  wall.add(mailbox)
  wall.position.z = -3.6
  root.add(wall)

  // A small red tricycle left by the wall.
  const trike = new THREE.Group()
  const tyre = kit.fill(palette.ink)
  const wheel = (r, x, z) => {
    const w = kit.drawn(new THREE.TorusGeometry(r, r * 0.22, 8, 24), tyre, { thick: 0.015 })
    w.rotation.y = Math.PI / 2
    w.position.set(x, r, z)
    trike.add(w)
  }
  wheel(0.36, 0, 0.55)
  wheel(0.22, -0.32, -0.35)
  wheel(0.22, 0.32, -0.35)
  const tube = kit.drawn(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8).rotateX(Math.PI / 2 - 0.35), red, { thick: 0.015 })
  tube.position.set(0, 0.48, 0.12)
  const axle = kit.drawn(box(0.72, 0.06, 0.06), red, { thick: 0.012 })
  axle.position.set(0, 0.24, -0.35)
  const seat = kit.drawn(box(0.3, 0.08, 0.34), kit.fill(palette.ink), { thick: 0.015 })
  seat.position.set(0, 0.62, -0.12)
  const bars = kit.drawn(box(0.62, 0.05, 0.05), red, { thick: 0.012 })
  bars.position.set(0, 0.92, 0.5)
  const stem = kit.drawn(box(0.05, 0.5, 0.05), red, { thick: 0.012 })
  stem.position.set(0, 0.68, 0.55)
  trike.add(tube, axle, seat, bars, stem)
  trike.position.set(2.5, 0, -2.75)
  trike.rotation.y = -1.2
  root.add(trike)

  // Hiroshi's Carport on the right lane with small green family sedan
  const carport = new THREE.Group()
  carport.position.set(7.5, 0, -5.8)
  for (const [cx, cz] of [[-1.5, -2.2], [1.5, -2.2], [-1.5, 2.2], [1.5, 2.2]]) {
    const cp = kit.drawn(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), wallGrey, { thick: 0.015 })
    cp.position.set(cx, 1.4, cz)
    carport.add(cp)
  }
  const cRoof = kit.drawn(box(3.4, 0.1, 4.8), kit.fill(mix(palette.blue, palette.paper, 0.6)), { thick: 0.02 })
  cRoof.position.set(0, 2.85, 0)
  cRoof.rotation.z = -0.06
  carport.add(cRoof)

  // Hiroshi's classic small green family hatchback car
  const car = new THREE.Group()
  const carGreen = kit.fill(mix(palette.blue, palette.yellow, 0.62))
  car.add(kit.drawn(box(2.0, 0.8, 3.8), carGreen, { thick: 0.03 }))
  const cabin = kit.drawn(box(1.8, 0.7, 2.2), carGreen, { thick: 0.025 })
  cabin.position.set(0, 0.72, -0.2)
  car.add(cabin)
  const carGlass = kit.fill(mix(palette.blue, palette.paper, 0.45))
  const fGlass = new THREE.Mesh(box(1.7, 0.55, 0.04), carGlass)
  fGlass.position.set(0, 0.7, 0.92)
  fGlass.rotation.x = -0.32
  car.add(fGlass)
  for (const [wx, wz] of [[-0.95, -1.1], [0.95, -1.1], [-0.95, 1.1], [0.95, 1.1]]) {
    const wh = kit.drawn(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 16).rotateZ(Math.PI / 2), kit.fill(palette.ink), { thick: 0.015 })
    wh.position.set(wx, -0.15, wz)
    car.add(wh)
  }
  for (const hx of [-0.68, 0.68]) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), yellow)
    lamp.position.set(hx, 0.12, 1.91)
    car.add(lamp)
  }
  car.position.set(0, 0.52, 0)
  carport.add(car)
  root.add(carport)

  // Telephone pole with sagging wires running out of frame.
  const tp = new THREE.Group()
  const mast = kit.drawn(new THREE.CylinderGeometry(0.13, 0.17, 9, 10), wallGrey, { thick: 0.04 })
  mast.position.y = 4.5
  const arm = kit.drawn(box(2.2, 0.14, 0.14), wallGrey, { thick: 0.03 })
  arm.position.y = 8.2
  tp.add(mast, arm)
  tp.position.set(3.6, 0, -4.4)
  root.add(tp)
  const wireMat = kit.ink()
  for (const dx of [-0.9, 0, 0.9]) {
    const a = new THREE.Vector3(3.6 + dx, 8.28, -4.4)
    const b = new THREE.Vector3(-16 + dx, 9.2, -10)
    const mid = a.clone().lerp(b, 0.5)
    mid.y -= 1.1
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, 0.022, 4, false)
    root.add(new THREE.Mesh(tube, wireMat))
  }

  // Shero's doghouse: red walls, blue roof, a dark doorway and his name board.
  const dog = new THREE.Group()
  const dw = kit.drawn(box(2.0, 1.5, 1.9), red, { thick: 0.04 })
  dw.position.y = 0.75
  const droof = kit.drawn(gable(2.4, 0.9, 2.5), dogRoofMat, { thick: 0.04 })
  droof.position.y = 1.5
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28, 0, Math.PI), ink)
  hole.position.set(0, 0.18, 0.96)
  const holeLow = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.18), ink)
  holeLow.position.set(0, 0.09, 0.96)
  const board = nameBoard('SHERO', palette)
  board.mesh.position.set(0, 1.86, 1.08)
  board.mesh.rotation.x = -0.12
  disposables.push(board.tex, board.mesh.material, board.mesh.geometry)

  // Blue food bowl with kibble
  const bowl = kit.drawn(new THREE.CylinderGeometry(0.34, 0.24, 0.18, 20), kit.fill(palette.blue), { thick: 0.025 })
  const kibble = kit.drawn(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), kit.fill(mix(palette.red, palette.yellow, 0.5)), { thick: 0.01 })
  kibble.position.y = 0.08
  bowl.add(kibble)
  bowl.position.set(1.35, 0.08, 1.2)

  // Blue water dish with clear water
  const waterDish = kit.drawn(new THREE.CylinderGeometry(0.3, 0.22, 0.16, 20), kit.fill(palette.blue), { thick: 0.02 })
  const waterMesh = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), kit.fill(mix(palette.blue, palette.paper, 0.6)))
  waterMesh.rotation.x = -Math.PI / 2
  waterMesh.position.y = 0.06
  waterDish.add(waterMesh)
  waterDish.position.set(1.4, 0.08, 0.4)

  dog.add(dw, droof, hole, holeLow, board.mesh, bowl, waterDish)
  dog.position.set(-1.9, 0, -0.3)
  dog.rotation.y = 0.42
  root.add(dog)
  const dogShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3), kit.shadow(0.38))
  dogShadow.rotation.x = -Math.PI / 2
  dogShadow.position.set(-1.6, 0.003, -0.1)
  root.add(dogShadow)

  // Round garden trees behind the wall and along the boundary.
  const trunk = kit.drawn(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 8), wood, { thick: 0.03 })
  trunk.position.set(-5.6, 1.2, -5.2)
  const crown = kit.drawn(new THREE.SphereGeometry(1.5, 24, 16), kit.fill(mix(palette.blue, palette.yellow, 0.62), { fluff: 0.35, freq: 1.6, seed: 3 }), { thick: 0.05 })
  crown.position.set(-5.6, 3.3, -5.2)
  root.add(trunk, crown)

  // Second garden tree near the carport
  const trunk2 = kit.drawn(new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8), wood, { thick: 0.025 })
  trunk2.position.set(5.2, 1.1, -8.6)
  const crown2 = kit.drawn(new THREE.SphereGeometry(1.2, 20, 14), kit.fill(mix(palette.blue, palette.yellow, 0.58), { fluff: 0.3, freq: 1.8, seed: 7 }), { thick: 0.04 })
  crown2.position.set(5.2, 2.8, -8.6)
  root.add(trunk2, crown2)

  // Canonical Kasukabe Neighborhood:
  // 1. Kitamoto-san's house to the left ("お隣の北本さん", iconic blue-tiled roof)
  const neighborLeft = new THREE.Group()
  const nLWall = kit.fill(mix(palette.paper, palette.yellow, 0.32))
  const nLGround = kit.drawn(box(5.8, 2.8, 4.6), nLWall, { thick: 0.04 })
  nLGround.position.y = 1.4
  const nLUpper = kit.drawn(box(4.8, 2.4, 4.0), nLWall, { thick: 0.04 })
  nLUpper.position.set(-0.2, 3.9, 0)
  const nLRoofMesh = kit.drawn(gable(5.4, 1.4, 4.5), dogRoofMat, { thick: 0.04 })
  nLRoofMesh.position.set(-0.2, 5.2, 0)
  const nLEave = kit.drawn(box(6.2, 0.2, 4.8), dogRoofMat, { thick: 0.03 })
  nLEave.position.set(0, 2.85, 0)
  for (const [wx, wy] of [[-1.2, 3.9], [1.2, 3.9], [-1.4, 1.4], [1.4, 1.4]]) {
    const wMesh = kit.drawn(box(0.9, 0.8, 0.06), yellow, { thick: 0.025 })
    wMesh.position.set(wx, wy, 2.32)
    neighborLeft.add(wMesh)
  }
  neighborLeft.add(nLGround, nLUpper, nLRoofMesh, nLEave)
  neighborLeft.position.set(-11.5, 0, -11.0)
  root.add(neighborLeft)

  // Green garden hedge along Kitamoto-san's property boundary
  const hedgeMat = kit.fill(mix(palette.blue, palette.yellow, 0.52), { fluff: 0.25, freq: 2.0 })
  const hedgeLeft = kit.drawn(box(1.0, 1.5, 8.5), hedgeMat, { thick: 0.035 })
  hedgeLeft.position.set(-7.8, 0.75, -8.0)
  root.add(hedgeLeft)

  // 2. Neighboring suburban house behind the carport to the right (greenish-teal roof)
  const neighborRight = new THREE.Group()
  const nRWall = kit.fill(mix(palette.paper, palette.yellow, 0.26))
  const nRRoof = kit.fill(mix(palette.blue, palette.yellow, 0.42))
  const nRGround = kit.drawn(box(6.0, 2.8, 4.6), nRWall, { thick: 0.04 })
  nRGround.position.y = 1.4
  const nRUpper = kit.drawn(box(5.0, 2.3, 4.0), nRWall, { thick: 0.04 })
  nRUpper.position.set(0.3, 3.85, 0)
  const nRRoofMesh = kit.drawn(gable(5.6, 1.35, 4.4), nRRoof, { thick: 0.04 })
  nRRoofMesh.position.set(0.3, 5.15, 0)
  const nREave = kit.drawn(box(6.4, 0.2, 4.8), nRRoof, { thick: 0.03 })
  nREave.position.set(0, 2.85, 0)
  // Rooftop TV aerial antenna
  const antPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), ink)
  antPole.position.set(0.3, 6.4, 0)
  const antCross = new THREE.Mesh(box(0.8, 0.02, 0.02), ink)
  antCross.position.set(0.3, 6.7, 0)
  const antCross2 = new THREE.Mesh(box(0.6, 0.02, 0.02), ink)
  antCross2.position.set(0.3, 6.9, 0)
  neighborRight.add(nRGround, nRUpper, nRRoofMesh, nREave, antPole, antCross, antCross2)
  neighborRight.position.set(14.0, 0, -12.5)
  neighborRight.rotation.y = 0.15
  root.add(neighborRight)

  // 3. Kasukabe distant suburban backdrop silhouettes
  const backdrop = new THREE.Group()
  backdrop.position.set(0, 0, -18.5)
  const dHouses = [
    { x: -5.5, w: 4.8, h: 4.2, rColor: mix(palette.blue, palette.yellow, 0.38) },
    { x: 1.5, w: 5.2, h: 4.6, rColor: mix(palette.red, palette.yellow, 0.35) },
    { x: 8.5, w: 4.5, h: 4.0, rColor: palette.blue },
  ]
  for (const dh of dHouses) {
    const bgHouse = kit.drawn(box(dh.w, dh.h, 2.2), cream, { thick: 0.03 })
    bgHouse.position.set(dh.x, dh.h / 2, 0)
    const bgRoof = kit.drawn(gable(dh.w + 0.6, 1.2, 2.6), kit.fill(dh.rColor), { thick: 0.035 })
    bgRoof.position.set(dh.x, dh.h + 0.6, 0)
    backdrop.add(bgHouse, bgRoof)
  }
  const backFence = kit.drawn(box(28, 1.3, 0.15), wallGrey, { thick: 0.03 })
  backFence.position.set(0, 0.65, 1.5)
  backdrop.add(backFence)
  root.add(backdrop)

  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 8; i++) {
    const tuft = new THREE.Mesh(new THREE.PlaneGeometry(0.8 + rnd(), 0.3 + rnd() * 0.25), kit.shadow(0.2))
    tuft.rotation.x = -Math.PI / 2
    tuft.position.set((rnd() - 0.5) * 12, 0.002, -3 + rnd() * 5.5)
    root.add(tuft)
  }

  return {
    root,
    ground: yardGround,
    bowl,
    bowlWorld: () => bowl.getWorldPosition(new THREE.Vector3()),
    waterDish,
    plate: plate.mesh,
    trike,
    car,
    carWorld: () => car.getWorldPosition(new THREE.Vector3()),
    gate,
    gateWorld: () => gate.getWorldPosition(new THREE.Vector3()),
    mailbox,
    doghouse: dog,
    doghouseWorld: () => dog.getWorldPosition(new THREE.Vector3()),
    deck,
    verandaWorld: () => deck.getWorldPosition(new THREE.Vector3()),
    house,
    door,
    doorWorld: () => door.getWorldPosition(new THREE.Vector3()),
    dispose() { disposables.forEach((d) => d.dispose()) },
  }
}
