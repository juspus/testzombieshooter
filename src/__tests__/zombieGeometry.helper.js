// Test helper: mounts the real <ZombieBody> with react-three-fiber (stub renderer, no WebGL), so
// tests can measure the actual model geometry and tie the hitbox specs to it.
import React from 'react'
import { createRoot, act, extend } from '@react-three/fiber'
import * as THREE from 'three'
import { ZombieBody } from '../components/Zombie'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
extend(THREE)

export async function mountZombie(type, id) {
  const canvas = document.createElement('canvas')
  const gl = {
    render() {}, setPixelRatio() {}, setSize() {}, dispose() {}, shadowMap: {}, domElement: canvas, info: {},
    getContext() { return null }, capabilities: {}, setClearColor() {}, getPixelRatio: () => 1, getSize: (v) => v.set(100, 100),
    xr: { enabled: false, addEventListener() {}, removeEventListener() {} },
  }
  const root = createRoot(canvas)
  await act(async () => {
    root.configure({ gl, frameloop: 'never', size: { width: 100, height: 100, top: 0, left: 0 }, events: undefined })
  })
  let store
  await act(async () => {
    store = root.render(React.createElement(ZombieBody, { type, id }))
  })
  return { scene: store.getState().scene, unmount: () => root.unmount() }
}

// Every hitbox sits directly in a "frame" group (head group, torso frame, a shoulder, a hip, a spider
// limb group). A visual mesh belongs to its nearest ancestor frame. measureFrames returns, per hitbox
// key, the union of that frame's visual meshes in two spaces: `frame` (the frame group's local space,
// used to size boxes) and `unit` (the hitbox mesh's local space, where |x|,|y|,|z| <= 0.5 is inside).
// Transparent meshes (floor aura discs, flame cones) are not part of the body.
export function frameKey(hb) {
  const f = hb.parent
  const part = hb.userData.hitbox
  if (part === 'arm' || part === 'leg') return part + (f.position.x < 0 ? 'L' : 'R')
  if (part === 'limb') return f.position.x === 0.5 ? 'limbLower' : 'limbUpper'
  return part
}

export function measureFrames(scene) {
  scene.updateMatrixWorld(true)
  const frames = new Map()
  scene.traverse((o) => { if (o.userData?.hitbox) frames.set(o.parent, o) })
  const out = {}
  const v = new THREE.Vector3()
  scene.traverse((m) => {
    if (!m.isMesh || m.userData.hitbox || m.material?.transparent) return
    let f = m.parent
    while (f && !frames.has(f)) f = f.parent
    if (!f) return
    const hb = frames.get(f)
    const key = frameKey(hb)
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    const bb = m.geometry.boundingBox
    const rec = (out[key] = out[key] || { hitbox: hb, frame: new THREE.Box3(), unit: new THREE.Box3() })
    const toFrame = new THREE.Matrix4().copy(f.matrixWorld).invert().multiply(m.matrixWorld)
    const toBox = new THREE.Matrix4().copy(hb.matrixWorld).invert().multiply(m.matrixWorld)
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
      rec.frame.expandByPoint(v.clone().applyMatrix4(toFrame))
      rec.unit.expandByPoint(v.clone().applyMatrix4(toBox))
    }
  })
  return out
}
