import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TRAIL_LIFETIME = 0.12
const POOL_SIZE = 20

const _trailPool = Array.from({ length: POOL_SIZE }, () => {
  const positions = new Float32Array(6)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.LineBasicMaterial({ color: '#ffe066', transparent: true, opacity: 1, depthWrite: false })
  const line = new THREE.Line(geo, mat)
  line.visible = false
  return { line, positions, life: 0, active: false }
})
let _nextSlot = 0

export default function BulletTrails() {
  const groupRef = useRef()

  useEffect(() => {
    const group = groupRef.current
    _trailPool.forEach(slot => group.add(slot.line))
    return () => _trailPool.forEach(slot => group.remove(slot.line))
  }, [])

  BulletTrails.add = (start, end) => {
    const slot = _trailPool[_nextSlot]
    _nextSlot = (_nextSlot + 1) % POOL_SIZE
    slot.positions[0] = start.x; slot.positions[1] = start.y; slot.positions[2] = start.z
    slot.positions[3] = end.x;   slot.positions[4] = end.y;   slot.positions[5] = end.z
    slot.line.geometry.attributes.position.needsUpdate = true
    slot.line.material.opacity = 1
    slot.line.visible = true
    slot.life = TRAIL_LIFETIME
    slot.active = true
  }

  useFrame((_, delta) => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = _trailPool[i]
      if (!slot.active) continue
      slot.life -= delta
      if (slot.life <= 0) {
        slot.active = false
        slot.line.visible = false
        continue
      }
      slot.line.material.opacity = slot.life / TRAIL_LIFETIME
    }
  })

  return <group ref={groupRef} />
}
