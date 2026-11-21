import * as THREE from 'three'

// Zombie hitboxes: a BROAD PHASE for every zombie hit test.
//
// Each zombie carries 6 invisible boxes (head, torso, two arms, two legs; the spider has head, torso
// and 8 limb boxes) parented to the groups that animate, so a ray is first tested against a handful
// of boxes instead of the ~117 meshes of the visual tree (measured 10 Nov: 2.05 ms per frame of
// auto-shoot targeting and 5.1 ms per shotgun shot with 25 zombies). A hit only counts if the
// NARROW phase agrees: one raycast against that single zombie's visual tree. Head or body comes from
// that visual hit (userData.isHead), exactly as before the boxes existed, and bullet holes / blood
// land on the body surface. So the boxes never decide anything on their own; they only have to be
// supersets of the visual parts, and src/__tests__/hitboxes.test.js enforces that against the real
// model geometry (all types, many variants).
//
// The boxes are meshes with `visible={false}`: three.js raycasts ignore .visible, rendering skips
// them (no draw call, no shader program, no shadow). They sit on layer HITBOX_LAYER, so a plain
// `raycaster.intersectObject(root, true)` (layer 0) only ever sees the visual tree.

export const HITBOX_LAYER = 1

// One geometry and one material for every box of every zombie (the mesh scale sizes the box).
export const HB_GEO = new THREE.BoxGeometry(1, 1, 1)
// DoubleSide: a ray that starts inside a box (a zombie in your face) still registers.
export const HB_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

// Box specs, in the local frame of the group each box is parented to (p = centre, s = size):
//   head:         the head group (follows the head snap and lean)
//   torso:        the body frame (neck, chest, and for the crawler its trailing legs)
//   legL, legR:   the hip groups (swing with the gait)
//   armL, armR:   the shoulder groups (swing and rise)
//   limbUpper/Lower: spider only, inside each limb's raise group and knee group
// Bounds come from the real model (union over many variants, measured with the helper in
// src/__tests__/zombieGeometry.helper.js) plus a margin. If the model changes the superset test
// fails; re-measure and update the numbers below.
const MARGIN = 0.02
const bounds = (min, max) => ({
  p: min.map((v, i) => +((v + max[i]) / 2).toFixed(4)),
  s: min.map((v, i) => +(max[i] - v + 2 * MARGIN).toFixed(4)),
})
const HEAD = bounds([-0.176, 0.47, -0.163], [0.172, 1.024, 0.18])
const TORSO = bounds([-0.29, -0.255, -0.115], [0.29, 0.59, 0.14])
const ARM_L = bounds([-0.145, -0.476, -0.054], [0.05, 0.02, 0.55])
const ARM_R = bounds([-0.05, -0.461, -0.04], [0.143, 0.024, 0.523])
const LEG = bounds([-0.08, -0.735, -0.085], [0.08, -0.02, 0.175])
const BASE = { head: HEAD, torso: TORSO, legL: LEG, legR: LEG, armL: ARM_L, armR: ARM_R }

export const HITBOX_SPECS = {
  default: BASE,
  screamer: { ...BASE, torso: bounds([-0.29, -0.495, -0.163], [0.29, 0.941, 0.196]), armL: bounds([-0.145, -0.55, -0.054], [0.05, 0.02, 0.674]), armR: bounds([-0.05, -0.531, -0.04], [0.143, 0.024, 0.643]) },
  exploder: { ...BASE, torso: bounds([-0.356, -0.255, -0.253], [0.36, 0.59, 0.453]) },
  armored: {
    head: bounds([-0.203, 0.47, -0.213], [0.203, 1.25, 0.202]),
    torso: bounds([-0.365, -0.255, -0.135], [0.365, 0.59, 0.19]),
    armL: bounds([-0.156, -0.476, -0.054], [0.05, 0.02, 0.55]),
    armR: bounds([-0.05, -0.461, -0.04], [0.153, 0.024, 0.523]),
    legL: bounds([-0.09, -0.735, -0.085], [0.09, -0.02, 0.175]),
    legR: bounds([-0.09, -0.735, -0.085], [0.09, -0.02, 0.175]),
  },
  spitter: { ...BASE, head: bounds([-0.2, 0.4, -0.163], [0.2, 1.024, 0.18]), torso: bounds([-0.29, -0.255, -0.191], [0.29, 0.59, 0.17]) },
  // The crawler has no leg groups: its trailing legs and gore are meshes of the torso frame, so the
  // torso box reaches back to z = -0.48.
  crawler: { ...BASE, torso: bounds([-0.29, -0.342, -0.48], [0.29, 0.59, 0.14]), legL: null, legR: null },
  spider: {
    ...BASE, legL: null, legR: null, armL: null, armR: null,
    limbUpper: bounds([0, -0.07, -0.07], [0.57, 0.07, 0.07]),
    limbLower: bounds([0, -0.051, -0.069], [1.19, 0.043, 0.069]),
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

// A zombie hit test. Broad phase: the hitboxes. Narrow phase: one raycast against this zombie's
// visual tree (layer 0, so the boxes are excluded). Only a narrow-phase hit counts; head or body is
// that mesh's userData.isHead. Transparent meshes (the floor aura discs of the boss, runner and
// screamer) are not part of the body and are skipped; flame cones already have raycast disabled.
// Returns { distance, point, face, isHead } or null.
const _visual = []
export function hitZombieRay(rc, root) {
  if (!zombieBoxHit(rc, root)) return null
  _visual.length = 0
  rc.intersectObject(root, true, _visual)
  let h = null
  for (let i = 0; i < _visual.length; i++) {
    if (!_visual[i].object.material?.transparent) { h = _visual[i]; break }
  }
  _visual.length = 0
  if (!h) return null
  return { distance: h.distance, point: h.point, face: h.face ?? null, isHead: h.object.userData.isHead === true }
}
