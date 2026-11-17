import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { mountZombie } from './zombieGeometry.helper'
import { SLOTS, bakeParts, zombieMaterial, patchZombieShader, resolveVertex } from '../zombieMesh'
import { zombieGeometryJobs, cachedZombieGeometryCount } from '../zombieParts'
import { ZOMBIE_ARCHETYPES } from '../store'

// A zombie is about six baked part meshes (head, body, two arms, two legs), not ~120 boxes. These
// tests pin that, the shadow-caster budget (CLAUDE.md root cause 3), the headshot / flash / corpse
// markers the rest of the game relies on, and that the shader patch still applies to this three.js.
const TYPES = Object.keys(ZOMBIE_ARCHETYPES)

function parts(scene) {
  const meshes = []
  scene.traverse((o) => { if (o.isMesh && !o.userData.hitbox && !o.material?.transparent) meshes.push(o) })
  return meshes
}

describe.each(TYPES)('%s is a handful of merged parts', (type) => {
  it('mesh count, shadow casters, markers', async () => {
    for (const id of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const { scene, unmount } = await mountZombie(type, id)
      const ms = parts(scene)
      // head + body + 2 arms + 2 legs (+ the spitter's throat sac); the spider has 8 limb halves instead
      expect(ms.length, `${type}#${id}`).toBeLessThanOrEqual(type === 'spider' ? 10 : 7)
      expect(ms.filter((m) => m.castShadow).length, `${type}#${id} casters`).toBeLessThanOrEqual(6)
      for (const m of ms) {
        expect(m.userData.zombieId, 'every part is flashed / frozen via zombieId').toBeDefined()
        expect(m.material.isMeshStandardMaterial && m.material.vertexColors).toBe(true)
        expect(m.geometry.attributes.zmat && m.geometry.attributes.zemi && m.geometry.attributes.color).toBeTruthy()
      }
      const heads = ms.filter((m) => m.userData.isHead)
      expect(heads.length, 'exactly one head mesh').toBe(1)
      // the head mesh holds the skull: it reaches the top of the head and the eyes glow
      const gb = heads[0].geometry.boundingBox
      expect(gb.max.y).toBeGreaterThan(0.95)
      let glow = 0
      const g = heads[0].geometry
      for (let i = 0; i < g.attributes.position.count; i++) if (g.attributes.zemi.getW(i) >= 3) glow++
      expect(glow, 'eye glow vertices (2 eyes x 2 boxes x 24)').toBe(96)
      expect(ms.filter((m) => !m.userData.isHead && m.userData.isHead !== false).length).toBe(0)
      unmount()
    }
  })

  it('nodes per zombie stay small', async () => {
    const { scene, unmount } = await mountZombie(type, 3)
    let n = 0
    scene.traverse(() => n++)
    expect(n).toBeLessThan(40)   // was ~130
    unmount()
  })
})

describe('shared geometry and materials', () => {
  it('equal looks share geometry; equal palettes share one material', async () => {
    const a = await mountZombie('walker', 11)
    const b = await mountZombie('walker', 11)
    const ga = parts(a.scene).map((m) => m.geometry)
    const gb = parts(b.scene).map((m) => m.geometry)
    expect(ga.length).toBe(gb.length)
    ga.forEach((g, i) => expect(g).toBe(gb[i]))
    expect(parts(a.scene)[0].material).toBe(parts(b.scene)[0].material)
    a.unmount(); b.unmount()
  })

  it('a new colour variant does not build geometry', async () => {
    const warm = await mountZombie('walker', 20)   // make sure the base walker set exists
    warm.unmount()
    const n0 = cachedZombieGeometryCount()
    // many walkers: only structural variants (torn jaw, stump, ribs) may add geometry, colours never do
    let structural = 0
    for (let id = 100; id < 140; id++) {
      const { scene, unmount } = await mountZombie('walker', id)
      structural += parts(scene).length
      unmount()
    }
    expect(structural).toBeGreaterThan(0)
    expect(cachedZombieGeometryCount() - n0).toBeLessThanOrEqual(7)   // at most the 7 rare structural keys
  })

  it('the idle prewarm covers every geometry the game can ask for', async () => {
    for (const job of zombieGeometryJobs(TYPES, ['boss'])) job()
    const n = cachedZombieGeometryCount()
    for (const type of TYPES) for (let id = 0; id < 60; id++) {
      const { unmount } = await mountZombie(type, id)
      unmount()
    }
    expect(cachedZombieGeometryCount()).toBe(n)
  })
})

describe('palette and vertex data', () => {
  it('slot colours come from the palette, fixed colours stay, emissive follows', () => {
    const colors = Object.fromEntries(SLOTS.map((s, i) => [s, '#' + (0x102030 + i * 0x101010).toString(16).padStart(6, '0')]))
    const mat = zombieMaterial('test-pal', colors)
    expect(zombieMaterial('test-pal', {})).toBe(mat)   // cached by key
    const pal = mat.userData.palette
    const geo = bakeParts([
      { s: [1, 1, 1], p: [0, 0, 0], r: null, c: '@skin', ro: 0.9, me: 0, em: null, ei: 0 },
      { s: [1, 1, 1], p: [0, 0, 0], r: null, c: '#ff0000', ro: 0.5, me: 0.6, em: '#00ff00', ei: 2 },
      { s: [1, 1, 1], p: [0, 0, 0], r: [0.3, 0, 0], c: '@eye', ro: 1, me: 0, em: true, ei: 3.5 },
    ])
    const skin = new THREE.Color(colors.skin), eye = new THREE.Color(colors.eye)
    const a = resolveVertex(geo, 0, pal)
    expect(a.color[0]).toBeCloseTo(skin.r, 5)
    expect(a.roughness).toBeCloseTo(0.9, 5)
    expect(a.emissive).toEqual([0, 0, 0])
    const b = resolveVertex(geo, 24, pal)
    expect(b.color[0]).toBeCloseTo(1, 5)
    expect(b.color[1]).toBeCloseTo(0, 5)
    expect(b.metalness).toBeCloseTo(0.6, 5)
    expect(b.emissive[1]).toBeCloseTo(2, 5)
    const c = resolveVertex(geo, 48, pal)
    expect(c.emissive[0]).toBeCloseTo(eye.r * 3.5, 4)
    expect(c.emissive[2]).toBeCloseTo(eye.b * 3.5, 4)
  })

  it('the shader patch still applies to this three.js (every anchor exists)', () => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }
    const v0 = shader.vertexShader, f0 = shader.fragmentShader
    patchZombieShader(shader, new Float32Array(36))
    expect(shader.uniforms.uZPal).toBeDefined()
    expect(shader.vertexShader).not.toBe(v0)
    expect(shader.vertexShader).toContain('uZPal[int(zmat.x')
    expect(shader.vertexShader).toContain('vColor *= zPal')
    expect(shader.fragmentShader).not.toBe(f0)
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance = vZe')
    expect(shader.fragmentShader).toContain('roughnessFactor = vZm.x')
    expect(shader.fragmentShader).toContain('metalnessFactor = vZm.y')
    expect(shader.fragmentShader).not.toContain('totalEmissiveRadiance = emissive;')
  })
})
