import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL_SIZE = 40
const LIFETIME = 0.35

const pool = Array.from({ length: POOL_SIZE }, () => ({
  active: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  life: 0,
  maxLife: LIFETIME,
  scale: 0.1,
}))
let nextSlot = 0

const _spread = new THREE.Vector3()

export default function FlameSpray() {
  const meshRefs = useRef([])

  // Spawns `count` flame particles at `origin` traveling along `dir` (normalized).
  FlameSpray.spray = (origin, dir, count = 2) => {
    for (let n = 0; n < count; n++) {
      const i = nextSlot
      nextSlot = (nextSlot + 1) % POOL_SIZE
      const slot = pool[i]
      _spread.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)
      slot.active = true
      slot.pos.copy(origin)
      slot.vel.copy(dir).multiplyScalar(6 + Math.random() * 3).add(_spread)
      slot.maxLife = LIFETIME * (0.7 + Math.random() * 0.6)
      slot.life = slot.maxLife
      slot.scale = 0.07 + Math.random() * 0.06
      const mesh = meshRefs.current[i]
      if (mesh) {
        mesh.position.copy(origin)
        mesh.visible = true
      }
    }
  }

  useFrame((_, delta) => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = pool[i]
      if (!slot.active) continue
      slot.pos.addScaledVector(slot.vel, delta)
      slot.life -= delta
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      if (slot.life <= 0) {
        slot.active = false
        mesh.visible = false
        continue
      }
      const t = slot.life / slot.maxLife
      mesh.position.copy(slot.pos)
      mesh.scale.setScalar(slot.scale * (1.7 - t * 0.7))
      mesh.material.opacity = t * 0.85
    }
  })

  return (
    <>
      {pool.map((_, i) => (
        <mesh key={i} ref={(el) => (meshRefs.current[i] = el)} visible={false} renderOrder={2}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? '#ffdd55' : '#ff7700'}
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </>
  )
}
