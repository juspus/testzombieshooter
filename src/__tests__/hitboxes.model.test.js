import { describe, it, expect } from 'vitest'
import { mountZombie, measureFrames } from './zombieGeometry.helper'

// Ties the hitbox specs to the REAL model: mounts <ZombieBody> for every type and many variants
// (react-three-fiber with a stub renderer) and checks that each hitbox contains every visual mesh of
// its frame (head group, torso frame, shoulders, hips, spider limbs) and is not absurdly bigger.
// If the model changes (parts added, moved, resized), this fails: re-measure and update the numbers
// in src/hitboxes.js.
const TYPES = ['walker', 'runner', 'brute', 'screamer', 'crawler', 'exploder', 'armored', 'spitter', 'spider', 'boss']
const VARIANTS = 40
const EPS = 1e-4

const EXPECTED_KEYS = {
  default: ['head', 'torso', 'armL', 'armR', 'legL', 'legR'],
  crawler: ['head', 'torso', 'armL', 'armR'],
  spider: ['head', 'torso', 'limbUpper', 'limbLower'],
}

describe.each(TYPES)('hitboxes cover the %s model', (type) => {
  it('every frame has a box that contains all of its visual meshes, for every variant', async () => {
    const union = {}
    for (let id = 0; id < VARIANTS; id++) {
      const { scene, unmount } = await mountZombie(type, id)
      const frames = measureFrames(scene)
      expect(Object.keys(frames).sort()).toEqual([...(EXPECTED_KEYS[type] ?? EXPECTED_KEYS.default)].sort())
      for (const [key, rec] of Object.entries(frames)) {
        const u = rec.unit
        // |x|,|y|,|z| <= 0.5 in the box's own unit space means inside the box
        for (const v of [u.min.x, u.min.y, u.min.z, u.max.x, u.max.y, u.max.z]) {
          expect(Math.abs(v), `${type}#${id} ${key}`).toBeLessThanOrEqual(0.5 + EPS)
        }
        const sc = rec.hitbox.scale
        union[key] = union[key] ?? { box: [sc.x, sc.y, sc.z], min: [1, 1, 1], max: [-1, -1, -1] }
        union[key].min = [Math.min(union[key].min[0], u.min.x), Math.min(union[key].min[1], u.min.y), Math.min(union[key].min[2], u.min.z)]
        union[key].max = [Math.max(union[key].max[0], u.max.x), Math.max(union[key].max[1], u.max.y), Math.max(union[key].max[2], u.max.z)]
      }
      unmount()
    }
    // not wildly oversized: over all variants each box is at most 0.1 m larger than the union of
    // what it covers, per axis (broad phase cost grows with sloppy boxes)
    for (const [key, r] of Object.entries(union)) {
      for (let a = 0; a < 3; a++) {
        const covered = (r.max[a] - r.min[a]) * r.box[a]
        expect(r.box[a] - covered, `${type} ${key} axis ${a}`).toBeLessThanOrEqual(0.1)
      }
    }
  })
})

describe('the crawler trailing legs are covered', () => {
  it('its torso box reaches back over the trailing gore and leg meshes', async () => {
    const { scene, unmount } = await mountZombie('crawler', 3)
    const torso = measureFrames(scene).torso
    expect(torso.frame.min.z).toBeLessThan(-0.4)   // the trailing meshes sit at z -0.18..-0.48 of the torso frame
    unmount()
  })
})
