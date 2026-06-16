import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL_SIZE = 40
const LIFETIME = 0.35
const HIT_RADIUS_SQ = 0.5 * 0.5
const PARTICLE_HIT_DAMAGE = 0.1

const pool = Array.from({ length: POOL_SIZE }, () => ({
  active: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  life: 0,
  maxLife: LIFETIME,
  scale: 0.1,
  hitZombies: new Set(),
}))
let nextSlot = 0

const _spread = new THREE.Vector3()
const _zpos = new THREE.Vector3()

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
      slot.hitZombies.clear()
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

      // Per-particle zombie collision — each particle can hit each zombie once
      const refs = FlameSpray.zombieRefs
      const onHit = FlameSpray.onZombieHit
      if (refs && onHit) {
        for (const id in refs) {
          const zref = refs[id]
          if (!zref) continue
          const zid = Number(id)
          if (slot.hitZombies.has(zid)) continue
          zref.getWorldPosition(_zpos)
          const dx = slot.pos.x - _zpos.x
          const dy = slot.pos.y - _zpos.y
          const dz = slot.pos.z - _zpos.z
          if (dx * dx + dy * dy + dz * dz < HIT_RADIUS_SQ) {
            slot.hitZombies.add(zid)
            onHit(zid, PARTICLE_HIT_DAMAGE)
          }
        }
      }
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
