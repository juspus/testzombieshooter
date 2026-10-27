import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { countScene } from '../sceneStats'
import { ENTRIES, CATEGORIES, getEntry } from '../registry'

describe('countScene', () => {
  it('counts triangles and meshes, skipping invisible subtrees', () => {
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))      // 12 tris
    const hidden = new THREE.Group()
    hidden.visible = false
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    root.add(hidden)
    expect(countScene(root)).toEqual({ tris: 12, meshes: 1 })
  })
})

describe('registry', () => {
  it('has unique ids and complete entries', () => {
    const ids = ENTRIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const cats = CATEGORIES.map((c) => c.id)
    for (const e of ENTRIES) {
      expect(cats).toContain(e.category)
      expect(typeof e.Component).toBe('function')
      expect(Array.isArray(e.animations)).toBe(true)
      expect(e.defaultCamera.position).toHaveLength(3)
      expect(e.defaultCamera.target).toHaveLength(3)
    }
  })
  it('includes every zombie archetype and resolves ids', () => {
    for (const t of ['walker', 'runner', 'brute', 'screamer', 'crawler', 'boss']) expect(getEntry(t)?.category).toBe('zombies')
    expect(getEntry('nope')).toBeNull()
  })
})
