import * as THREE from 'three'

// Zombie hitboxes. Every zombie carries 2-3 invisible boxes (head, torso, legs; the spider adds a
// limb box) parented to the groups that animate, so bullets, pellets, aim assist and auto-shoot test
// a handful of boxes instead of the ~117 meshes of the visual tree (measured 10 Nov: 2.05 ms per
// frame of auto-shoot targeting and 5.1 ms per shotgun shot with 25 zombies, boxes 0.03 ms).
//
// The boxes are meshes with `visible={false}`: three.js raycasts ignore .visible, rendering skips
// them (no draw call, no shader program, no shadow). They sit on layer HITBOX_LAYER, so a plain
// `raycaster.intersectObject(root, true)` (layer 0) still sees only the visual tree. That is how a
// hit is refined to the body surface for bullet holes and impact FX.

export const HITBOX_LAYER = 1

// One geometry and one material for every box of every zombie (the mesh scale sizes the box).
export const HB_GEO = new THREE.BoxGeometry(1, 1, 1)
// DoubleSide: a ray that starts inside a box (a zombie in your face) still registers.
export const HB_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

// Box specs: p = centre, s = size, r = x rotation (rad), in the local frame of the group the box is
// parented to. Sizes were tuned against the old full-tree raycast on live, animated zombies (random
// rays, see docs in the commit); boxes err on the generous side, a missed hit feels worse than a
// forgiving one.
//   head:         the head group (follows the head snap and lean)
//   torso:        the body frame (the group that holds neck, chest, arms and legs)
//   legL, legR:   the hip groups (swing with the gait)
//   armL, armR:   the shoulder groups (swing and rise), one slanted box along shoulder-elbow-hand
//   limbUpper/Lower: spider only, inside each limb's raise group and knee group
const box = (p, s, r = 0) => ({ p, s, r })
const HEAD = box([0, 0.76, 0], [0.33, 0.52, 0.31])
const TORSO = box([0, 0.12, 0.005], [0.52, 0.76, 0.24])
const LEG = box([0, -0.38, 0], [0.16, 0.72, 0.20])
const ARM_L = box([-0.06, -0.23, 0.25], [0.14, 0.14, 0.58], 0.62)
const ARM_R = box([0.06, -0.23, 0.25], [0.14, 0.14, 0.58], 0.62)
const BASE = { head: HEAD, torso: TORSO, legL: LEG, legR: LEG, armL: ARM_L, armR: ARM_R }

export const HITBOX_SPECS = {
  default: BASE,
  armored: { ...BASE, head: box([0, 0.87, 0], [0.42, 0.78, 0.43]), torso: box([0, 0.12, 0.03], [0.74, 0.76, 0.34]) },
  spitter: { ...BASE, head: box([0, 0.74, 0.01], [0.42, 0.62, 0.36]) },
  exploder: { ...BASE, torso: box([0, 0.12, 0.1], [0.72, 0.76, 0.5]) },
  crawler: { ...BASE, legL: null, legR: null },
  spider: {
    ...BASE, legL: null, legR: null, armL: null, armR: null,
    limbUpper: box([0.25, 0, 0], [0.5, 0.14, 0.14]),
    limbLower: box([0.55, 0, 0], [1.2, 0.1, 0.14]),
  },
}

export function hitboxSpec(type) {
  return HITBOX_SPECS[type] ?? HITBOX_SPECS.default
}

// ---- raycasting ----

const _root = new WeakMap()   // zombie root -> its hitbox meshes
const _out = []               // scratch result list (never escapes)

export function hitboxesOf(root) {
  let list = _root.get(root)
  if (list) return list
  list = []
  root.traverse((o) => { if (o.isMesh && o.userData.hitbox) list.push(o) })
  if (list.length) _root.set(root, list)   // not cached when empty: boxes may mount a frame later
  return list
}

// Nearest hitbox intersection of `rc` with one zombie, or null. Intersection objects are the usual
// three.js ones (distance, point, face, object); `object.userData.isHead` tells head from body.
export function zombieBoxHit(rc, root) {
  const boxes = hitboxesOf(root)
  let best = null
  for (let i = 0; i < boxes.length; i++) {
    _out.length = 0
    boxes[i].raycast(rc, _out)
    for (let j = 0; j < _out.length; j++) if (!best || _out[j].distance < best.distance) best = _out[j]
  }
  _out.length = 0
  return best
}

// A zombie hit test: boxes decide hit or miss and head or body; one raycast against this zombie's
// visual tree (layer 0, boxes excluded) then moves the point onto the body surface for bullet holes,
// blood and impacts. If the visual tree is missed (the box is a little generous) the box hit stands.
// Returns { distance, point, face, isHead } or null.
export function hitZombieRay(rc, root) {
  const b = zombieBoxHit(rc, root)
  if (!b) return null
  const isHead = b.object.userData.isHead === true
  const v = rc.intersectObject(root, true)[0]
  const h = v ?? b
  return { distance: h.distance, point: h.point, face: h.face ?? null, isHead }
}
