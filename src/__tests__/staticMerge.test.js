import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { bakeStatic, materialSignature } from '../staticMerge'

const matA = () => new THREE.MeshStandardMaterial({ color: '#2a1608', roughness: 0.95 })
const box = (mat, x, y, z, w = 1, h = 1, d = 1, { cast = false, recv = true } = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = recv
  return m
}
const meshes = (root) => { const o = []; root.traverse((n) => { if (n.isMesh) o.push(n) }); return o }
const bounds = (root) => { const b = new THREE.Box3(); root.updateMatrixWorld(true); for (const m of meshes(root)) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)) } return b }

describe('bakeStatic', () => {
  it('merges meshes of one material into one mesh and keeps the geometry in place', () => {
    const root = new THREE.Group()
    root.position.set(5, 0, 0)
    const shared = matA()
    const g = new THREE.Group()
    g.position.set(0, 0, 3)
    g.rotation.y = Math.PI / 2
    root.add(box(shared, 0, 0, 0), box(shared, 2, 0, 0), g)
    g.add(box(shared, 1, 1, 0, 2, 1, 1))
    const before = bounds(root)
    const triBefore = meshes(root).reduce((n, m) => n + m.geometry.index.count / 3, 0)

    const { stats } = bakeStatic(root)
    expect(stats.merged).toBe(1)
    expect(stats.from).toBe(3)
    const after = meshes(root)
    expect(after).toHaveLength(1)
    expect(after[0].geometry.index.count / 3).toBe(triBefore)
    expect(after[0].material).toBe(shared)   // reused by reference: no new shader program
    const a = bounds(root)
    for (const k of ['x', 'y', 'z']) {
      expect(a.min[k]).toBeCloseTo(before.min[k], 5)
      expect(a.max[k]).toBeCloseTo(before.max[k], 5)
    }
    expect(g.parent).toBeNull()   // the emptied group went with its meshes
  })

  it('never mixes casters with non-casters, or receivers with non-receivers', () => {
    const root = new THREE.Group()
    const m = matA()
    root.add(
      box(m, 0, 0, 0, 1, 1, 1, { cast: true }), box(m, 2, 0, 0, 1, 1, 1, { cast: true }),
      box(m, 4, 0, 0, 1, 1, 1, { cast: false }), box(m, 6, 0, 0, 1, 1, 1, { cast: false }),
      box(m, 8, 0, 0, 1, 1, 1, { cast: false, recv: false }), box(m, 10, 0, 0, 1, 1, 1, { cast: false, recv: false }),
    )
    bakeStatic(root)
    const out = meshes(root)
    expect(out).toHaveLength(3)
    expect(out.filter((x) => x.castShadow)).toHaveLength(1)
    expect(out.filter((x) => !x.castShadow && x.receiveShadow)).toHaveLength(1)
    expect(out.filter((x) => !x.castShadow && !x.receiveShadow)).toHaveLength(1)
    const caster = out.find((x) => x.castShadow)
    expect(caster.userData.merged).toBe(2)
  })

  it('merges equal-signature materials that are different instances, keeps different ones apart', () => {
    const root = new THREE.Group()
    root.add(box(matA(), 0, 0, 0), box(matA(), 2, 0, 0), box(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.95 }), 4, 0, 0), box(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.95 }), 6, 0, 0))
    expect(materialSignature(matA())).toBe(materialSignature(matA()))
    bakeStatic(root)
    expect(meshes(root)).toHaveLength(2)
  })

  it('leaves transparent, emissive, ordered, hidden, no-merge and lone meshes alone', () => {
    const root = new THREE.Group()
    const m = matA()
    const glass = box(new THREE.MeshStandardMaterial({ color: '#4a6a78', transparent: true, opacity: 0.3 }), 0, 0, 0)
    const glow = box(new THREE.MeshStandardMaterial({ color: '#ffaa00', emissive: '#ffaa00', emissiveIntensity: 4 }), 1, 0, 0)
    const glow2 = box(new THREE.MeshStandardMaterial({ color: '#ffaa00', emissive: '#ffaa00', emissiveIntensity: 4 }), 2, 0, 0)
    const ordered = box(m, 3, 0, 0); ordered.renderOrder = 2
    const hidden = box(m, 4, 0, 0); hidden.visible = false
    const keep = box(m, 5, 0, 0); keep.userData.noMerge = true
    const a = box(m, 6, 0, 0)
    const b = box(m, 7, 0, 0)
    const lone = box(new THREE.MeshStandardMaterial({ color: '#222222' }), 8, 0, 0)
    root.add(glass, glow, glow2, ordered, hidden, keep, a, b, lone)
    bakeStatic(root)
    const out = meshes(root)
    // 8 untouched originals minus the merged pair (a, b) plus their one merged mesh
    expect(out).toHaveLength(9 - 2 + 1)
    for (const k of [glass, glow, glow2, ordered, hidden, keep, lone]) expect(out).toContain(k)
    expect(out.filter((x) => x.userData.merged)).toHaveLength(1)
  })

  it('skips mirrored meshes (their winding would flip) and instanced meshes', () => {
    const root = new THREE.Group()
    const m = matA()
    const mirrored = box(m, 0, 0, 0); mirrored.scale.x = -1
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, 2)
    root.add(mirrored, inst, box(m, 3, 0, 0), box(m, 5, 0, 0))
    bakeStatic(root)
    const out = meshes(root)
    expect(out).toContain(mirrored)
    expect(out).toContain(inst)
    expect(out.filter((x) => x.userData.merged)).toHaveLength(1)
  })

  it('freezes what stays (not lights) and never the root', () => {
    const root = new THREE.Group()
    const m = matA()
    const light = new THREE.PointLight()
    const glow = box(new THREE.MeshStandardMaterial({ emissive: '#ff2200', emissiveIntensity: 1 }), 0, 0, 0)
    root.add(box(m, 1, 0, 0), box(m, 2, 0, 0), glow, light)
    bakeStatic(root)
    expect(root.matrixAutoUpdate).toBe(true)
    expect(glow.matrixAutoUpdate).toBe(false)
    expect(light.matrixAutoUpdate).toBe(true)
    const merged = meshes(root).find((x) => x.userData.merged)
    expect(merged.matrixAutoUpdate).toBe(false)
  })

  it('keeps a group that still holds a light or a loose mesh', () => {
    const root = new THREE.Group()
    const m = matA()
    const g = new THREE.Group()
    g.add(box(m, 0, 0, 0), box(m, 1, 0, 0), new THREE.PointLight())
    root.add(g, box(m, 5, 0, 0))
    bakeStatic(root)
    expect(g.parent).toBe(root)
    expect(g.children.filter((c) => c.isLight)).toHaveLength(1)
    expect(g.children.filter((c) => c.isMesh)).toHaveLength(0)
  })

  it('undo restores the original scene and disposes the merged buffers (StrictMode, HMR, unmount)', () => {
    const root = new THREE.Group()
    const m = matA()
    const g = new THREE.Group()
    g.position.y = 1
    const a = box(m, 0, 0, 0), b = box(m, 2, 0, 0), c = box(m, 4, 0, 0)
    g.add(a, b)
    root.add(g, c)
    const { undo } = bakeStatic(root)
    const merged = meshes(root).find((x) => x.userData.merged)
    let disposed = 0
    merged.geometry.addEventListener('dispose', () => { disposed++ })
    undo()
    expect(disposed).toBe(1)
    expect(meshes(root)).toHaveLength(3)
    expect(a.parent).toBe(g)
    expect(g.parent).toBe(root)
    expect(c.parent).toBe(root)
    expect(a.matrixAutoUpdate).toBe(true)
    // and it can bake again
    const again = bakeStatic(root)
    expect(again.stats.merged).toBe(1)
    expect(meshes(root)).toHaveLength(1)
  })

  it('merges geometry that carries a vertex-colour attribute only with its own kind', () => {
    const root = new THREE.Group()
    const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true })
    const mk = (x) => {
      const g = new THREE.BoxGeometry(1, 1, 1)
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.5), 3))
      const mesh = new THREE.Mesh(g, vcMat)
      mesh.position.x = x
      return mesh
    }
    root.add(mk(0), mk(2), box(matA(), 4, 0, 0), box(matA(), 6, 0, 0))
    bakeStatic(root)
    const out = meshes(root)
    expect(out).toHaveLength(2)
    expect(out.find((x) => x.material === vcMat).geometry.attributes.color.count).toBe(48)
  })

  it('does not freeze invisible or userData.dynamic subtrees: they still move after the bake (diner glass shards)', () => {
    const root = new THREE.Group()
    const mat = matA()
    const win = new THREE.Group()
    win.position.set(-5, 1, 6)
    const shards = new THREE.Group()
    const shard = box(mat, 0, 0, 0, 0.1, 0.1, 0.01)
    shard.visible = false
    shards.add(shard)
    const dyn = new THREE.Group()
    dyn.userData.dynamic = true
    const mover = box(mat, 0, 0, 0)
    dyn.add(mover)
    win.add(shards)
    root.add(box(mat, 0, 0, 0), box(mat, 2, 0, 0), win, dyn)

    bakeStatic(root)
    expect(shard.matrixAutoUpdate).toBe(true)
    expect(mover.matrixAutoUpdate).toBe(true)
    expect(dyn.matrixAutoUpdate).toBe(true)
    expect(win.matrixAutoUpdate).toBe(false)   // the static parent still freezes

    shard.visible = true
    shard.position.set(0.5, -0.5, 0)
    mover.position.set(0, 3, 0)
    root.updateMatrixWorld(true)
    const w = new THREE.Vector3().setFromMatrixPosition(shard.matrixWorld)
    expect(w.x).toBeCloseTo(-4.5, 5)
    expect(w.y).toBeCloseTo(0.5, 5)
    expect(w.z).toBeCloseTo(6, 5)
    expect(new THREE.Vector3().setFromMatrixPosition(mover.matrixWorld).y).toBeCloseTo(3, 5)
  })
})
