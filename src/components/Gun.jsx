import { useRef, useMemo } from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import * as THREE from 'three'

const _muzzleWorld = new THREE.Vector3()

export default function Gun() {
  const { camera } = useThree()

  // Dedicated scene + camera for the weapon — rendered in a second pass
  const weaponScene = useMemo(() => {
    const s = new THREE.Scene()
    s.add(new THREE.AmbientLight('#ffffff', 3))
    return s
  }, [])

  const weaponCamera = useMemo(
    () => new THREE.PerspectiveCamera(60, 1, 0.01, 10),
    []
  )

  const groupRef = useRef()
  const flashRef = useRef()
  const recoil = useRef(0)
  const flashLife = useRef(0)

  Gun.fire = () => {
    recoil.current = 1
    flashLife.current = 1
  }

  Gun.getMuzzlePosition = () => _muzzleWorld.clone()

  // Priority 1 = runs after all priority-0 useFrames; taking priority > 0
  // halts R3F's own render so we drive both passes manually.
  useFrame(({ gl, scene, size }, delta) => {
    // Sync weapon camera aspect
    weaponCamera.aspect = size.width / size.height
    weaponCamera.updateProjectionMatrix()

    // Decay recoil + flash
    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 10)
    if (flashRef.current) {
      flashLife.current = Math.max(0, flashLife.current - delta * 20)
      flashRef.current.intensity = flashLife.current * 4
    }

    // Position gun group in weapon-camera local space
    if (groupRef.current) {
      const recoilZ = recoil.current * 0.06
      const recoilAngle = recoil.current * 0.18
      groupRef.current.position.set(0.22, -0.22, -(0.38 - recoilZ))
      groupRef.current.rotation.set(recoilAngle, 0, 0)
      groupRef.current.updateMatrixWorld()
    }

    // Muzzle world position: transform weapon-cam-local → world via main camera
    // Muzzle sits at approx [0.22, -0.20, -0.69] in weapon camera space
    const muzzleLocal = new THREE.Vector3(0.22, -0.20, -0.69)
    muzzleLocal.applyMatrix4(camera.matrixWorld)
    _muzzleWorld.copy(muzzleLocal)

    // Pass 1: main scene
    gl.render(scene, camera)

    // Pass 2: weapon on top — clear depth so it is never occluded
    gl.autoClear = false
    gl.clearDepth()
    gl.render(weaponScene, weaponCamera)
    gl.autoClear = true
  }, 1)

  const gunMat = (color, metalness = 0.7, roughness = 0.3) => (
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  )

  return createPortal(
    <group ref={groupRef}>
      {/* Slide / upper receiver */}
      <mesh position={[0, 0.04, -0.04]}>
        <boxGeometry args={[0.065, 0.055, 0.26]} />
        {gunMat('#585858')}
      </mesh>

      {/* Lower frame */}
      <mesh position={[0, -0.01, 0.02]}>
        <boxGeometry args={[0.06, 0.045, 0.18]} />
        {gunMat('#636363', 0.5, 0.4)}
      </mesh>

      {/* Barrel */}
      <mesh position={[0, 0.02, -0.22]}>
        <boxGeometry args={[0.032, 0.032, 0.18]} />
        {gunMat('#444', 0.9, 0.15)}
      </mesh>

      {/* Grip */}
      <mesh position={[0, -0.1, 0.06]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.058, 0.13, 0.082]} />
        {gunMat('#3a3a3a', 0.1, 0.95)}
      </mesh>

      {/* Trigger guard */}
      <mesh position={[0, -0.035, 0.02]}>
        <boxGeometry args={[0.045, 0.014, 0.075]} />
        {gunMat('#555', 0.4, 0.5)}
      </mesh>

      {/* Sight rear */}
      <mesh position={[0, 0.075, 0.08]}>
        <boxGeometry args={[0.05, 0.018, 0.014]} />
        {gunMat('#666', 0.6, 0.3)}
      </mesh>

      {/* Sight front */}
      <mesh position={[0, 0.075, -0.14]}>
        <boxGeometry args={[0.01, 0.018, 0.01]} />
        {gunMat('#666', 0.6, 0.3)}
      </mesh>

      {/* Muzzle flash */}
      <pointLight ref={flashRef} position={[0, 0.02, -0.31]} intensity={0} color="#ff9900" distance={4} />
    </group>,
    weaponScene
  )
}
