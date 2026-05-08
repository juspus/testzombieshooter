import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Muzzle world position, updated every frame
const _muzzleWorld = new THREE.Vector3()
// Local muzzle tip offset inside the gun group
const MUZZLE_LOCAL = new THREE.Vector3(0, 0.02, -0.31)

export default function Gun() {
  const { camera } = useThree()
  const groupRef = useRef()
  const flashRef = useRef()
  const recoil = useRef(0)
  const flashLife = useRef(0)

  useEffect(() => {
    if (!groupRef.current) return
    camera.add(groupRef.current)
    return () => camera.remove(groupRef.current)
  }, [camera])

  Gun.fire = () => {
    recoil.current = 1
    flashLife.current = 1
  }

  Gun.getMuzzlePosition = () => _muzzleWorld.clone()

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Recoil: kick back then spring forward
    if (recoil.current > 0) {
      recoil.current = Math.max(0, recoil.current - delta * 10)
      groupRef.current.position.z = -0.38 + recoil.current * 0.06
      groupRef.current.rotation.x = recoil.current * 0.18
    } else {
      groupRef.current.position.z = -0.38
      groupRef.current.rotation.x = 0
    }

    // Muzzle flash
    if (flashRef.current) {
      flashLife.current = Math.max(0, flashLife.current - delta * 20)
      flashRef.current.intensity = flashLife.current * 3
    }

    // Update muzzle world position
    const tip = MUZZLE_LOCAL.clone()
    groupRef.current.localToWorld(tip)
    _muzzleWorld.copy(tip)
  })

  return (
    // Gun group lives in camera space: right, down, forward
    <group ref={groupRef} position={[0.22, -0.22, -0.38]}>

      {/* Slide / upper receiver */}
      <mesh position={[0, 0.04, -0.04]}>
        <boxGeometry args={[0.065, 0.055, 0.26]} />
        <meshStandardMaterial color="#1c1c1c" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Lower frame / body */}
      <mesh position={[0, -0.01, 0.02]}>
        <boxGeometry args={[0.06, 0.045, 0.18]} />
        <meshStandardMaterial color="#252525" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Barrel */}
      <mesh position={[0, 0.02, -0.22]}>
        <boxGeometry args={[0.032, 0.032, 0.18]} />
        <meshStandardMaterial color="#111" metalness={0.95} roughness={0.15} />
      </mesh>

      {/* Grip */}
      <mesh position={[0, -0.1, 0.06]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.058, 0.13, 0.082]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.2} roughness={0.9} />
      </mesh>

      {/* Trigger guard */}
      <mesh position={[0, -0.035, 0.02]}>
        <boxGeometry args={[0.045, 0.014, 0.075]} />
        <meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Sight (rear) */}
      <mesh position={[0, 0.075, 0.08]}>
        <boxGeometry args={[0.05, 0.018, 0.014]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Sight (front) */}
      <mesh position={[0, 0.075, -0.14]}>
        <boxGeometry args={[0.01, 0.018, 0.01]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Muzzle flash light */}
      <pointLight
        ref={flashRef}
        position={[0, 0.02, -0.31]}
        intensity={0}
        color="#ff9900"
        distance={4}
      />
    </group>
  )
}
