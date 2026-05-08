import { useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const _muzzleWorld = new THREE.Vector3()

export default function Gun() {
  const { camera } = useThree()
  const groupRef = useRef()
  const flashRef = useRef()
  const recoil = useRef(0)
  const flashLife = useRef(0)

  Gun.fire = () => {
    recoil.current = 1
    flashLife.current = 1
  }

  Gun.getMuzzlePosition = () => _muzzleWorld.clone()

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Decay recoil
    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 10)

    // Muzzle flash
    if (flashRef.current) {
      flashLife.current = Math.max(0, flashLife.current - delta * 20)
      flashRef.current.intensity = flashLife.current * 3
    }

    const recoilZ = recoil.current * 0.06
    const recoilAngle = recoil.current * 0.18

    // Position gun in world space by transforming the camera-local offset
    const offset = new THREE.Vector3(0.22, -0.22, -(0.38 - recoilZ))
    offset.applyQuaternion(camera.quaternion)
    groupRef.current.position.copy(camera.position).add(offset)
    groupRef.current.quaternion.copy(camera.quaternion)
    if (recoilAngle > 0) groupRef.current.rotateX(recoilAngle)

    // Muzzle world position for bullet trail origin
    const tip = new THREE.Vector3(0, 0.02, -0.31)
    groupRef.current.localToWorld(tip)
    _muzzleWorld.copy(tip)
  })

  const mat = (color) => (
    <meshStandardMaterial
      color={color}
      metalness={0.7}
      roughness={0.3}
      depthTest={false}
    />
  )

  return (
    <group ref={groupRef}>
      {/* Constant gun light — illuminates gun independently of scene */}
      <pointLight position={[0, 0.05, 0.1]} intensity={2} color="#ffffff" distance={1.5} />

      {/* Slide / upper receiver */}
      <mesh renderOrder={999} position={[0, 0.04, -0.04]}>
        <boxGeometry args={[0.065, 0.055, 0.26]} />
        {mat('#585858')}
      </mesh>

      {/* Lower frame */}
      <mesh renderOrder={999} position={[0, -0.01, 0.02]}>
        <boxGeometry args={[0.06, 0.045, 0.18]} />
        {mat('#636363')}
      </mesh>

      {/* Barrel */}
      <mesh renderOrder={999} position={[0, 0.02, -0.22]}>
        <boxGeometry args={[0.032, 0.032, 0.18]} />
        {mat('#444')}
      </mesh>

      {/* Grip */}
      <mesh renderOrder={999} position={[0, -0.1, 0.06]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.058, 0.13, 0.082]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.95} depthTest={false} />
      </mesh>

      {/* Trigger guard */}
      <mesh renderOrder={999} position={[0, -0.035, 0.02]}>
        <boxGeometry args={[0.045, 0.014, 0.075]} />
        {mat('#555')}
      </mesh>

      {/* Sight rear */}
      <mesh renderOrder={999} position={[0, 0.075, 0.08]}>
        <boxGeometry args={[0.05, 0.018, 0.014]} />
        {mat('#666')}
      </mesh>

      {/* Sight front */}
      <mesh renderOrder={999} position={[0, 0.075, -0.14]}>
        <boxGeometry args={[0.01, 0.018, 0.01]} />
        {mat('#666')}
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
