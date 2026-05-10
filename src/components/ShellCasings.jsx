import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL_SIZE = 16
const pool = Array.from({ length: POOL_SIZE }, () => ({
  active: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  rotVel: new THREE.Vector3(),
  life: 0,
}))
let nextSlot = 0

export default function ShellCasings() {
  const meshRefs = useRef([])

  ShellCasings.eject = (origin, right) => {
    const i = nextSlot
    nextSlot = (nextSlot + 1) % POOL_SIZE
    const slot = pool[i]
    slot.active = true
    slot.pos.copy(origin)
    slot.vel.set(
      right.x * 2.5 + (Math.random() - 0.5) * 0.4,
      1.2 + Math.random() * 0.6,
      right.z * 2.5 + (Math.random() - 0.5) * 0.4,
    )
    slot.rotVel.set(
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 24,
    )
    slot.life = 1.8
    const mesh = meshRefs.current[i]
    if (mesh) {
      mesh.position.copy(origin)
      mesh.rotation.set(0, 0, 0)
      mesh.visible = true
    }
  }

  useFrame((_, delta) => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const slot = pool[i]
      if (!slot.active) continue
      slot.vel.y -= 9.8 * delta
      slot.pos.addScaledVector(slot.vel, delta)
      slot.life -= delta
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      if (slot.life <= 0) {
        slot.active = false
        mesh.visible = false
        continue
      }
      mesh.position.copy(slot.pos)
      mesh.rotation.x += slot.rotVel.x * delta
      mesh.rotation.y += slot.rotVel.y * delta
      mesh.rotation.z += slot.rotVel.z * delta
    }
  })

  return (
    <>
      {pool.map((_, i) => (
        <mesh key={i} ref={(el) => (meshRefs.current[i] = el)} visible={false}>
          <cylinderGeometry args={[0.010, 0.013, 0.070, 6]} />
          <meshStandardMaterial color="#cc7700" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}
    </>
  )
}
