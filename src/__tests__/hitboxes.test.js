import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HB_GEO, HB_MAT, HITBOX_LAYER, HITBOX_SPECS, hitboxSpec, hitboxesOf, zombieBoxHit, hitZombieRay } from '../hitboxes'

// A minimal zombie: root > head group + torso group, each holding one invisible hitbox (like
// components/Hitbox.jsx) and one visual mesh that is a little smaller than its box.
function makeBox(part, box) {
  const m = new THREE.Mesh(HB_GEO, HB_MAT)
  m.position.set(...box.p)
  m.scale.set(...box.s)
  m.visible = false
  m.layers.set(HITBOX_LAYER)
  m.userData = { hitbox: part, isHead: part === 'head' }
  return m
}
function makeZombie() {
  const root = new THREE.Group()
  const torso = new THREE.Group()
  const head = new THREE.Group()
  root.add(torso, head)
  torso.add(makeBox('torso', { p: [0, 0, 0], s: [0.6, 0.8, 0.3] }))
  head.add(makeBox('head', { p: [0, 0.75, 0], s: [0.34, 0.5, 0.34] }))
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.2), new THREE.MeshBasicMaterial())
  body.userData = { zombieId: 1, isHead: false }
  torso.add(body)
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.28), new THREE.MeshBasicMaterial())
  skull.userData = { zombieId: 1, isHead: true }
  skull.position.set(0, 0.75, 0)
  head.add(skull)
  root.updateMatrixWorld(true)
  return { root, torso, head, body, skull }
}
const ray = (ox, oy, oz, dx, dy, dz) => new THREE.Raycaster(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize(), 0, 50)

describe('hitbox specs', () => {
  it('every type resolves to a spec with a head and a torso', () => {
    for (const t of ['walker', 'runner', 'brute', 'screamer', 'crawler', 'exploder', 'armored', 'spitter', 'spider', 'boss', 'unknown']) {
      const s = hitboxSpec(t)
      expect(s.head).toBeTruthy()
      expect(s.torso).toBeTruthy()
    }
  })

  it('all boxes have positive sizes', () => {
    for (const spec of Object.values(HITBOX_SPECS)) {
      for (const b of Object.values(spec)) {
        if (!b) continue
        for (const n of b.s) expect(n).toBeGreaterThan(0)
      }
    }
  })

  it('crawler has no legs, spider has limb boxes and no arms or legs', () => {
    expect(hitboxSpec('crawler').legL).toBeNull()
    expect(hitboxSpec('crawler').armL).toBeTruthy()
    const sp = hitboxSpec('spider')
    expect(sp.legL).toBeNull()
    expect(sp.armR).toBeNull()
    expect(sp.limbUpper).toBeTruthy()
    expect(sp.limbLower).toBeTruthy()
  })
})

describe('zombieBoxHit', () => {
  it('hits the torso box from the front and reports a body hit', () => {
    const { root } = makeZombie()
    const h = zombieBoxHit(ray(0, 0, 5, 0, 0, -1), root)
    expect(h).toBeTruthy()
    expect(h.object.userData.isHead).toBe(false)
    expect(h.distance).toBeCloseTo(4.85, 2)   // front face of the 0.3 deep torso box
  })

  it('hits the head box at head height and reports a headshot', () => {
    const { root } = makeZombie()
    const h = zombieBoxHit(ray(0, 0.75, 5, 0, 0, -1), root)
    expect(h.object.userData.isHead).toBe(true)
  })

  it('misses when the ray passes beside or above the boxes', () => {
    const { root } = makeZombie()
    expect(zombieBoxHit(ray(1, 0, 5, 0, 0, -1), root)).toBeNull()
    expect(zombieBoxHit(ray(0, 2, 5, 0, 0, -1), root)).toBeNull()
  })

  it('returns the nearest box when the ray crosses several', () => {
    const { root } = makeZombie()
    // a downward ray from above at the head crosses the head box first, then the torso box
    const h = zombieBoxHit(ray(0, 3, 0, 0, -1, 0), root)
    expect(h.object.userData.isHead).toBe(true)
  })

  it('the head box follows its animated group (head snap)', () => {
    const { root, head } = makeZombie()
    expect(zombieBoxHit(ray(0.6, 0.75, 5, 0, 0, -1), root)).toBeNull()
    head.position.x = 0.6
    root.updateMatrixWorld(true)
    const h = zombieBoxHit(ray(0.6, 0.75, 5, 0, 0, -1), root)
    expect(h?.object.userData.isHead).toBe(true)
  })

  it('a moved or flipped root moves the boxes with it', () => {
    const { root } = makeZombie()
    root.position.set(3, 0, 0)
    root.rotation.z = Math.PI   // spider on the ceiling: upside down
    root.updateMatrixWorld(true)
    const h = zombieBoxHit(ray(3, -0.75, 5, 0, 0, -1), root)   // head is now below the torso
    expect(h?.object.userData.isHead).toBe(true)
  })

  it('registers a ray that starts inside a box (point-blank)', () => {
    const { root } = makeZombie()
    expect(zombieBoxHit(ray(0, 0, 0, 0, 0, -1), root)).toBeTruthy()
  })

  it('respects the ray range', () => {
    const { root } = makeZombie()
    const rc = ray(0, 0, 40, 0, 0, -1)
    rc.far = 10
    expect(zombieBoxHit(rc, root)).toBeNull()
  })
})

describe('hitboxes are invisible to visual-tree raycasts', () => {
  it('a plain layer-0 recursive raycast only returns visual meshes', () => {
    const { root } = makeZombie()
    const hits = ray(0, 0, 5, 0, 0, -1).intersectObject(root, true)
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(h.object.userData.hitbox).toBeUndefined()
  })

  it('hitboxes are not renderable: invisible, own layer, shared geometry and material', () => {
    const { root } = makeZombie()
    for (const m of hitboxesOf(root)) {
      expect(m.visible).toBe(false)
      expect(m.castShadow).toBe(false)
      expect(m.layers.test(new THREE.Layers())).toBe(false)   // layer 0 (the camera's) does not see them
      expect(m.geometry).toBe(HB_GEO)
      expect(m.material).toBe(HB_MAT)
    }
  })
})

describe('hitboxesOf', () => {
  it('finds the boxes once and caches them', () => {
    const { root } = makeZombie()
    const a = hitboxesOf(root)
    expect(a).toHaveLength(2)
    expect(hitboxesOf(root)).toBe(a)
  })

  it('does not cache an empty result (boxes may mount later)', () => {
    const root = new THREE.Group()
    expect(hitboxesOf(root)).toHaveLength(0)
    root.add(makeBox('torso', { p: [0, 0, 0], s: [1, 1, 1] }))
    expect(hitboxesOf(root)).toHaveLength(1)
  })
})

describe('hitZombieRay', () => {
  it('boxes decide head or body, the visual mesh places the point on the body surface', () => {
    const { root } = makeZombie()
    const h = hitZombieRay(ray(0, 0, 5, 0, 0, -1), root)
    expect(h.isHead).toBe(false)
    expect(h.distance).toBeCloseTo(4.9, 2)    // front of the 0.2 deep visual body, not the box face at 4.85
    expect(h.point.z).toBeCloseTo(0.1, 2)
    expect(h.face).toBeTruthy()
    const hh = hitZombieRay(ray(0, 0.75, 5, 0, 0, -1), root)
    expect(hh.isHead).toBe(true)
    expect(hh.point.z).toBeCloseTo(0.14, 2)
  })

  it('a ray inside a box but missing the visual body is a miss (boxes are only a broad phase)', () => {
    const { root } = makeZombie()
    // x = 0.28 is inside the torso box (0.3) but outside the visual body (0.25)
    expect(zombieBoxHit(ray(0.28, 0, 5, 0, 0, -1), root)).toBeTruthy()
    expect(hitZombieRay(ray(0.28, 0, 5, 0, 0, -1), root)).toBeNull()
  })

  it('head or body comes from the visual mesh, not from which box was hit', () => {
    const { root } = makeZombie()
    // through the head box but beside the 0.3 wide skull (box is 0.34): a miss, never a headshot
    expect(hitZombieRay(ray(0.16, 0.75, 5, 0, 0, -1), root)).toBeNull()
    // through the skull: headshot, from the mesh's isHead
    expect(hitZombieRay(ray(0, 0.75, 5, 0, 0, -1), root).isHead).toBe(true)
  })

  it('skips transparent meshes such as the floor aura discs', () => {
    const { root, torso } = makeZombie()
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ transparent: true }))
    aura.rotation.x = -Math.PI / 2
    aura.position.y = -0.6
    torso.add(aura)
    root.updateMatrixWorld(true)
    // a ray through the torso box that only crosses the disc below the body would hit the disc first
    // if it counted; it must not, and the body is hit instead
    const h = hitZombieRay(ray(0, 3, 0, 0, -1, 0), root)
    expect(h.isHead).toBe(true)
    // a ray that is inside the torso box and only meets the disc is a miss
    expect(hitZombieRay(ray(0.27, -0.5, 2, 0, -0.01, -1), root)).toBeNull()
  })

  it('returns null on a miss', () => {
    const { root } = makeZombie()
    expect(hitZombieRay(ray(2, 0, 5, 0, 0, -1), root)).toBeNull()
  })
})

// Source-text guards: the regressions these catch are silent (see CLAUDE.md perf rules).
const read = (f) => readFileSync(resolve(__dirname, '..', f), 'utf8')

describe('hitbox source guards', () => {
  it('the Hitbox component is invisible and never casts shadows', () => {
    const src = read('components/Hitbox.jsx')
    expect(src).toMatch(/visible=\{false\}/)
    expect(src).not.toMatch(/castShadow/)
  })

  it('the player raycasts zombies through the hitboxes, never the full visual tree', () => {
    const src = ['components/Player.jsx', 'player/usePlayerFiring.js', 'player/fireContext.js'].map(read).join('\n')
    expect(src).not.toMatch(/intersectObject\(\s*(ref|_autoNearRefs\[i\]|zombieRef)\b/)
    expect(src).toMatch(/hitZombieRay\(/)
  })

  it('Zombie.jsx places hitboxes in the animated groups (head, torso, arms, legs, spider limbs)', () => {
    const src = read('components/Zombie.jsx')
    for (const part of ['head', 'torso', 'arm', 'leg', 'limb']) expect(src).toContain(`<Hitbox part="${part}"`)
  })
})
