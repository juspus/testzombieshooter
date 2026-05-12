import { useRef, useMemo } from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import { useGameStore } from '../store'
import * as THREE from 'three'

const SWING_DUR = 0.35  // seconds for full swing arc

function HuntingKnifeModel() {
  const metal  = <meshStandardMaterial color="#b8b8b8" metalness={0.95} roughness={0.10} />
  const spine  = <meshStandardMaterial color="#1a1a1a" metalness={0.80} roughness={0.35} />
  const bolster = <meshStandardMaterial color="#888888" metalness={0.85} roughness={0.25} />
  const grip   = <meshStandardMaterial color="#2e1006" metalness={0.00} roughness={0.88} />
  const band   = <meshStandardMaterial color="#1a1a1a" metalness={0.70} roughness={0.45} />

  return (
    <group>
      {/* ── Blade ─────────────────────────────────────────────────── */}
      {/* Main blade flat */}
      <mesh position={[0, 0.005, -0.225]}>
        <boxGeometry args={[0.032, 0.020, 0.360]} />
        {metal}
      </mesh>
      {/* Spine — slightly raised back edge */}
      <mesh position={[0, 0.015, -0.220]}>
        <boxGeometry args={[0.028, 0.007, 0.345]} />
        {spine}
      </mesh>
      {/* Fuller (blood groove) */}
      <mesh position={[0.010, 0.005, -0.205]}>
        <boxGeometry args={[0.004, 0.005, 0.300]} />
        {spine}
      </mesh>
      {/* Tip taper — first step */}
      <mesh position={[0, 0.003, -0.402]}>
        <boxGeometry args={[0.022, 0.013, 0.080]} />
        {metal}
      </mesh>
      {/* Tip taper — second step (point) */}
      <mesh position={[0, 0.001, -0.441]}>
        <boxGeometry args={[0.012, 0.007, 0.044]} />
        {metal}
      </mesh>

      {/* ── Guard / Bolster ───────────────────────────────────────── */}
      <mesh position={[0, 0.002, -0.018]}>
        <boxGeometry args={[0.052, 0.022, 0.018]} />
        {bolster}
      </mesh>
      {/* Guard face detail */}
      <mesh position={[0, 0.002, -0.008]}>
        <boxGeometry args={[0.050, 0.020, 0.004]} />
        {band}
      </mesh>

      {/* ── Handle ────────────────────────────────────────────────── */}
      {/* Main grip body (wood scales) */}
      <mesh position={[0, 0.000, 0.087]}>
        <boxGeometry args={[0.033, 0.031, 0.132]} />
        {grip}
      </mesh>
      {/* Grip underside bevel */}
      <mesh position={[0, -0.017, 0.087]}>
        <boxGeometry args={[0.029, 0.005, 0.128]} />
        {band}
      </mesh>
      {/* Brass finger groove bands */}
      {[0.025, 0.060, 0.095, 0.130].map((z) => (
        <mesh key={z} position={[0, -0.002, z]}>
          <boxGeometry args={[0.035, 0.033, 0.010]} />
          {bolster}
        </mesh>
      ))}
      {/* Pommel cap */}
      <mesh position={[0, 0.001, 0.162]}>
        <boxGeometry args={[0.037, 0.035, 0.020]} />
        {bolster}
      </mesh>
    </group>
  )
}

export default function Knife() {
  const { camera } = useThree()
  const activeItem = useGameStore((s) => s.activeItem)

  const weaponScene = useMemo(() => {
    const s = new THREE.Scene()
    s.add(new THREE.AmbientLight('#ffffff', 3))
    return s
  }, [])

  const weaponCamera = useMemo(() => new THREE.PerspectiveCamera(60, 1, 0.01, 10), [])

  const groupRef = useRef()
  const swingT = useRef(0)  // counts from 1 → 0 during swing

  Knife.swing = () => { swingT.current = 1 }

  useFrame(({ gl, scene, size }, delta) => {
    weaponCamera.aspect = size.width / size.height
    weaponCamera.updateProjectionMatrix()

    if (swingT.current > 0) swingT.current = Math.max(0, swingT.current - delta / SWING_DUR)

    if (groupRef.current) {
      const t = 1 - swingT.current        // 0 → 1 as swing plays
      const arc = Math.sin(t * Math.PI)   // bell: 0 → peak → 0

      // Right-to-left slash: sweep across screen in X, roll wrist through Z
      groupRef.current.position.set(
        0.22 - arc * 0.42,   // sweeps from right to left across screen
        -0.16 + arc * 0.06,  // slight rise at peak
        -0.28 - arc * 0.04,
      )
      groupRef.current.rotation.set(
         0.10 + arc * 0.20,  // slight forward pitch
         0.10 + arc * 0.25,  // yaw inward as blade crosses body
        -0.30 - arc * 1.80,  // strong Z roll — wrist rotating through the slash
      )
    }

    if (activeItem !== 'knife') return

    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()
    gl.render(weaponScene, weaponCamera)
    gl.autoClear = true
  }, 1)

  return createPortal(<group ref={groupRef}><HuntingKnifeModel /></group>, weaponScene)
}
