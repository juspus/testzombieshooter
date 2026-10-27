import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Crossbow bolts in flight: a fixed pool of always-mounted meshes (shared geometry +
// material), toggled via `visible`. Damage is resolved instantly in Player.jsx; this is
// the visible bolt that streaks to the impact point and stays stuck there for a moment.
const POOL = 6
const SPEED = 55          // m/s
const STICK_TIME = 2.5    // s the bolt stays in the wall / body
const _geo = new THREE.BoxGeometry(0.045, 0.045, 0.6)
const _mat = new THREE.MeshBasicMaterial({ color: '#e8e0c0' })
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3(0, 0, 1)

const _slots = Array.from({ length: POOL }, () => ({ t: 0, life: 0, dur: 0, from: new THREE.Vector3(), to: new THREE.Vector3() }))
let _next = 0

export default function Bolts() {
  const refs = useRef([])

  Bolts.fire = (from, to) => {
    const i = _next
    _next = (_next + 1) % POOL
    const sl = _slots[i]
    const m = refs.current[i]
    if (!m) return
    sl.from.copy(from)
    sl.to.copy(to)
    _dir.subVectors(to, from)
    const len = _dir.length()
    sl.dur = Math.max(0.02, len / SPEED)
    sl.t = 0
    sl.life = sl.dur + STICK_TIME
    m.quaternion.setFromUnitVectors(_fwd, _dir.normalize())
    m.position.copy(from)
    m.visible = true
  }

  useFrame((_, dt) => {
    for (let i = 0; i < POOL; i++) {
      const m = refs.current[i]
      if (!m || !m.visible) continue
      const sl = _slots[i]
      sl.t += dt
      if (sl.t >= sl.life) { m.visible = false; continue }
      m.position.lerpVectors(sl.from, sl.to, Math.min(1, sl.t / sl.dur))
    }
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={_geo} material={_mat} visible={false} frustumCulled={false} />
      ))}
    </>
  )
}
