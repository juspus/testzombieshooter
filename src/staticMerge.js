import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Bakes a mounted subtree of STATIC meshes (walls, trim, beams, props, thickets) into a few meshes
// per material, once, right after mount. The scene is still described as ordinary R3F JSX; this
// pass collects every eligible mesh, bakes its world transform (relative to the bake root) into a
// cloned geometry, merges the clones, removes the originals and freezes what is left.
//
// Rules (they keep the look, the shadows and the shader programs exactly as they were):
//   - meshes merge only when their material has the same signature AND the same castShadow and
//     receiveShadow, so every merged mesh casts / receives exactly what its parts did;
//   - the material is REUSED (the first mesh's instance), never a new config: the program count
//     cannot rise (no vertexColors, no new flags);
//   - transparent, emissive, ordered (renderOrder), hidden, instanced, mirrored or
//     `userData.noMerge` meshes stay separate: they animate, sort or toggle;
//   - nothing here runs per frame. The returned function undoes the bake (React StrictMode runs
//     effect -> cleanup -> effect in dev, and HMR / unmount must not leak the merged buffers).

const _inv = new THREE.Matrix4()
const _rel = new THREE.Matrix4()
const KEEP_ATTRS = ['position', 'normal', 'uv', 'color']

/** Material signature: two meshes with the same one render identically with a shared material. */
export function materialSignature(m) {
  const mapId = m.map ? m.map.uuid : '-'
  return [
    m.type, mapId, m.color ? m.color.getHex() : '-', m.roughness, m.metalness, m.side,
    m.emissive ? m.emissive.getHex() : '-', m.emissiveIntensity, m.opacity, m.flatShading ? 1 : 0,
    m.vertexColors ? 1 : 0, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, m.alphaTest, m.fog ? 1 : 0,
  ].join('|')
}

function eligible(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return false
  if (o.userData && o.userData.noMerge) return false
  if (o.renderOrder !== 0 || o.children.length > 0) return false
  const g = o.geometry
  const m = o.material
  if (!g || !g.isBufferGeometry || !g.attributes.position || !m || Array.isArray(m)) return false
  if (!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial)) return false
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe) return false
  if (m.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) return false   // glow parts stay separate
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return false           // patched shader
  if (o.layers.mask !== 1) return false
  return true
}

/**
 * Merge the static meshes under `root`. Returns { undo, stats }.
 *  - meshes that are not eligible are left in place (and frozen);
 *  - groups left empty by the bake are removed too (their transforms are inside the merged geometry);
 *  - `freeze` (default true) sets matrixAutoUpdate = false on everything that stays under `root`
 *    except lights, after one matrix update, so the per-frame scene update skips them.
 */
export function bakeStatic(root, { freeze = true } = {}) {
  root.updateWorldMatrix(true, true)
  _inv.copy(root.matrixWorld).invert()

  const buckets = new Map()   // key -> { material, castShadow, receiveShadow, meshes: [] }
  root.traverseVisible((o) => {
    if (o === root || !eligible(o)) return
    o.updateWorldMatrix(true, false)
    if (_rel.multiplyMatrices(_inv, o.matrixWorld).determinant() <= 0) return   // mirrored: winding would flip
    const key = `${materialSignature(o.material)}#${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`
    let b = buckets.get(key)
    if (!b) { b = { material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, meshes: [] }; buckets.set(key, b) }
    b.meshes.push(o)
  })

  const added = []       // merged meshes
  const removed = []     // { obj, parent } in removal order
  const frozen = []
  let before = 0

  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue
    const geos = []
    let names = null
    let ok = true
    for (const mesh of b.meshes) {
      const g = mesh.geometry.clone()
      for (const k of Object.keys(g.attributes)) if (!KEEP_ATTRS.includes(k)) g.deleteAttribute(k)
      g.clearGroups()
      g.morphAttributes = {}
      _rel.multiplyMatrices(_inv, mesh.matrixWorld)
      g.applyMatrix4(_rel)
      const sig = Object.keys(g.attributes).sort().join()
      if (names === null) names = sig
      else if (names !== sig) ok = false
      if (!g.index) ok = false
      geos.push(g)
    }
    const merged = ok ? mergeGeometries(geos, false) : null
    geos.forEach((g) => g.dispose())
    if (!merged) continue   // odd attribute mix: leave this bucket alone
    merged.computeBoundingSphere()
    merged.computeBoundingBox()
    const mesh = new THREE.Mesh(merged, b.material)
    mesh.castShadow = b.castShadow
    mesh.receiveShadow = b.receiveShadow
    mesh.name = 'static-merged'
    mesh.userData.merged = b.meshes.length
    root.add(mesh)
    added.push(mesh)
    before += b.meshes.length
    for (const o of b.meshes) {
      const parent = o.parent
      parent.remove(o)
      removed.push({ obj: o, parent })
    }
  }

  // Groups the bake emptied (props, wall sections): drop them, bottom-up, never the root.
  for (let i = 0; i < removed.length; i++) {
    let p = removed[i].parent
    while (p && p !== root && p.parent && p.children.length === 0 && !p.isMesh && !p.isLight && !(p.userData && p.userData.keep)) {
      const up = p.parent
      up.remove(p)
      removed.push({ obj: p, parent: up })
      p = up
    }
  }

  if (freeze) {
    root.updateWorldMatrix(true, true)
    root.traverse((o) => {
      if (o === root || o.isLight || !o.matrixAutoUpdate) return
      o.matrixAutoUpdate = false
      frozen.push(o)
    })
  }

  let after = 0
  root.traverse((o) => { if (o.isMesh) after++ })

  const undo = () => {
    for (const o of frozen) o.matrixAutoUpdate = true
    for (const m of added) { m.parent?.remove(m); m.geometry.dispose() }
    for (let i = removed.length - 1; i >= 0; i--) removed[i].parent.add(removed[i].obj)
  }
  return { undo, stats: { merged: added.length, from: before, meshesAfter: after, frozen: frozen.length } }
}
