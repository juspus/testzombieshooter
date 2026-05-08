import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TRAIL_LIFETIME = 0.12

export default function BulletTrails() {
  const groupRef = useRef()
  const trails = useRef([])

  BulletTrails.add = (start, end) => {
    if (!groupRef.current) return
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    const material = new THREE.LineBasicMaterial({
      color: '#ffe066',
      transparent: true,
      opacity: 1,
      depthWrite: false,
    })
    const line = new THREE.Line(geometry, material)
    groupRef.current.add(line)
    trails.current.push({ line, life: TRAIL_LIFETIME })
  }

  useFrame((_, delta) => {
    trails.current = trails.current.filter((t) => {
      t.life -= delta
      if (t.life <= 0) {
        groupRef.current?.remove(t.line)
        t.line.geometry.dispose()
        t.line.material.dispose()
        return false
      }
      t.line.material.opacity = t.life / TRAIL_LIFETIME
      return true
    })
  })

  return <group ref={groupRef} />
}
