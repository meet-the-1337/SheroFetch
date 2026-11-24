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
  // Tatami lines on the floor.
  for (const x of [-3, 0, 3]) add(new THREE.Mesh(box(0.04, 0.02, 22), kit.ink(mix(palette.ink, palette.paper, 0.55))), x, 0.01, 6.5)
  // Window on the back wall, sky behind it.
  add(kit.drawn(box(2.8, 1.8, 0.1), kit.fill(mix(palette.blue, palette.paper, 0.55)), { thick: 0.04 }), 2.4, 2.4, -4.38)
  add(new THREE.Mesh(box(0.06, 1.8, 0.14), ink), 2.4, 2.4, -4.35)

  // Low round table with a snack box on it.
  add(kit.drawn(new THREE.CylinderGeometry(1.2, 1.2, 0.14, 32), wood, { thick: 0.035 }), -0.4, 0.62, 0.6)
  for (const [x, z] of [[-0.8, 0.2], [0, 0.2], [-0.8, 1.0], [0, 1.0]]) add(kit.drawn(box(0.1, 0.55, 0.1), wood, { thick: 0.02 }), -0.4 + x * 0.9 + 0.36, 0.28, z)
  const snack = add(kit.drawn(box(0.5, 0.36, 0.3), yellow, { thick: 0.025 }), -0.6, 0.87, 0.5)
  snack.rotation.y = 0.4

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
  add(kit.drawn(box(1.9, 1.25, 0.5), kit.fill(mix(palette.ink, palette.paper, 0.25)), { thick: 0.04 }), 3.4, 1.35, -2.7)
  const sc = document.createElement('canvas')
  sc.width = 512
  sc.height = 320
  const tex = new THREE.CanvasTexture(sc)
  tex.colorSpace = THREE.SRGBColorSpace
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: tex }))
  screen.position.set(3.4, 1.35, -2.44)
  root.add(screen)
  disposables.push(tex, screen.material, screen.geometry)
  const rgb = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`
  const setScreen = (top, line) => {
    const g = sc.getContext('2d')
    g.fillStyle = rgb(palette.blue)
    g.fillRect(0, 0, 512, 320)
    g.fillStyle = rgb(palette.paper)
    g.textAlign = 'center'
    g.font = '40px "Zen Maru Gothic", sans-serif'
    g.fillText(top, 256, 120)
    g.font = '64px "Darumadrop One", "Zen Maru Gothic", sans-serif'
    g.fillText(line.length > 14 ? line.slice(0, 13) + '…' : line, 256, 210)
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
    root, tv: screen, sofa, snack, crayons, setScreen,
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
  const roofMat = kit.fill(palette.blue)
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
  const roof = kit.drawn(gable(6.2, 1.5, 4.9), roofMat, { thick: 0.05 })
  roof.position.set(-0.6, 5.4, -0.1)
  const eave = kit.drawn(box(7.8, 0.22, 4.9), roofMat, { thick: 0.04 })
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
  win(1.8, 1.1, -1.9, 1.6, 2.22)
  win(1.5, 1.0, -1.6, 4.25, 1.92)
  win(1.2, 1.0, 0.9, 4.25, 1.92)
  const door = kit.drawn(box(1.0, 1.9, 0.1), wood, { thick: 0.035 })
  door.position.set(2.2, 0.95, 2.23)
  house.add(door)
  // Balcony rail and a laundry pole with a towel and a small red shirt.
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
  const towel = kit.drawn(box(0.9, 0.8, 0.03), kit.fill(mix(palette.blue, palette.paper, 0.5)), { thick: 0.025 })
  towel.position.set(-2.2, 4.5, 2.4)
  const shirt = kit.drawn(box(0.6, 0.55, 0.03), red, { thick: 0.025 })
  shirt.position.set(-1.1, 4.62, 2.4)
  house.add(pole, towel, shirt)
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
  wall.position.z = -3.6
  root.add(wall)

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
  const droof = kit.drawn(gable(2.4, 0.9, 2.5), roofMat, { thick: 0.04 })
  droof.position.y = 1.5
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28, 0, Math.PI), ink)
  hole.position.set(0, 0.18, 0.96)
  const holeLow = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.18), ink)
  holeLow.position.set(0, 0.09, 0.96)
  const board = nameBoard('SHERO', palette)
  board.mesh.position.set(0, 1.86, 1.08)
  board.mesh.rotation.x = -0.12
  disposables.push(board.tex, board.mesh.material, board.mesh.geometry)
  const bowl = kit.drawn(new THREE.CylinderGeometry(0.3, 0.22, 0.16, 20), yellow, { thick: 0.025 })
  bowl.position.set(1.35, 0.08, 1.2)
  dog.add(dw, droof, hole, holeLow, board.mesh, bowl)
  dog.position.set(-1.9, 0, -0.3)
  dog.rotation.y = 0.42
  root.add(dog)
  const dogShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3), kit.shadow(0.38))
  dogShadow.rotation.x = -Math.PI / 2
  dogShadow.position.set(-1.6, 0.003, -0.1)
  root.add(dogShadow)

  // A round garden tree behind the wall, and crayon tufts on the yard.
  const trunk = kit.drawn(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 8), wood, { thick: 0.03 })
  trunk.position.set(-5.6, 1.2, -5.2)
  const crown = kit.drawn(new THREE.SphereGeometry(1.5, 24, 16), kit.fill(mix(palette.blue, palette.yellow, 0.62), { fluff: 0.35, freq: 1.6, seed: 3 }), { thick: 0.05 })
  crown.position.set(-5.6, 3.3, -5.2)
  root.add(trunk, crown)
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
    doghouse: dog,
    house,
    door,
    doorWorld: () => door.getWorldPosition(new THREE.Vector3()),
    dispose() { disposables.forEach((d) => d.dispose()) },
  }
}
