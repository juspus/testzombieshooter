import { useRef, useMemo } from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import { useGameStore } from '../store'
import * as THREE from 'three'

const _muzzleWorld = new THREE.Vector3()

function PistolModel({ gunMat }) {
  return (
    <>
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
    </>
  )
}

function AKModel({ gunMat }) {
  const metal  = (color) => gunMat(color, 0.8, 0.25)
  const wood   = (color) => gunMat(color, 0.0, 0.92)
  const grip   = ()      => gunMat('#252525', 0.1, 0.9)
  return (
    <>
      {/* Upper receiver */}
      <mesh position={[0, 0.03, -0.10]}>
        <boxGeometry args={[0.095, 0.058, 0.40]} />
        {metal('#3c3c3c')}
      </mesh>

      {/* Barrel */}
      <mesh position={[0, 0.030, -0.44]}>
        <boxGeometry args={[0.028, 0.028, 0.44]} />
        {metal('#2e2e2e')}
      </mesh>

      {/* Gas tube above barrel */}
      <mesh position={[0, 0.062, -0.33]}>
        <boxGeometry args={[0.018, 0.018, 0.24]} />
        {metal('#383838')}
      </mesh>

      {/* Wooden handguard (below barrel front half) */}
      <mesh position={[0, 0.005, -0.29]}>
        <boxGeometry args={[0.052, 0.030, 0.22]} />
        {wood('#5c3210')}
      </mesh>

      {/* Wooden stock */}
      <mesh position={[0, -0.008, 0.225]} rotation={[-0.07, 0, 0]}>
        <boxGeometry args={[0.058, 0.072, 0.25]} />
        {wood('#5c3210')}
      </mesh>
      {/* Stock toe (slightly angled end) */}
      <mesh position={[0, -0.025, 0.345]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[0.055, 0.048, 0.06]} />
        {wood('#4e2a0c')}
      </mesh>

      {/* Pistol grip */}
      <mesh position={[0, -0.105, 0.055]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.052, 0.115, 0.068]} />
        {grip()}
      </mesh>

      {/* Trigger guard */}
      <mesh position={[0, -0.04, -0.01]}>
        <boxGeometry args={[0.040, 0.013, 0.09]} />
        {metal('#444')}
      </mesh>

      {/* Banana magazine — 3 angled segments */}
      <mesh position={[0, -0.088, -0.055]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.058, 0.055, 0.075]} />
        {metal('#2a2a1a')}
      </mesh>
      <mesh position={[0, -0.148, -0.080]} rotation={[-0.20, 0, 0]}>
        <boxGeometry args={[0.056, 0.068, 0.085]} />
        {metal('#2a2a1a')}
      </mesh>
      <mesh position={[0, -0.208, -0.092]} rotation={[-0.30, 0, 0]}>
        <boxGeometry args={[0.054, 0.042, 0.055]} />
        {metal('#252515')}
      </mesh>

      {/* Front sight post */}
      <mesh position={[0, 0.068, -0.64]}>
        <boxGeometry args={[0.036, 0.065, 0.038]} />
        {metal('#333')}
      </mesh>

      {/* Rear sight */}
      <mesh position={[0, 0.068, -0.02]}>
        <boxGeometry args={[0.055, 0.024, 0.038]} />
        {metal('#444')}
      </mesh>
    </>
  )
}

function DeagleModel({ gunMat }) {
  const chrome = (r = 0.15) => gunMat('#aaaaaa', 0.9, r)
  const dark   = ()         => gunMat('#2e2e2e', 0.8, 0.2)
  return (
    <>
      {/* Main slide — large and boxy */}
      <mesh position={[0, 0.04, -0.06]}>
        <boxGeometry args={[0.085, 0.075, 0.32]} />
        {chrome()}
      </mesh>

      {/* Slide top rib */}
      <mesh position={[0, 0.085, -0.06]}>
        <boxGeometry args={[0.030, 0.014, 0.32]} />
        {chrome(0.3)}
      </mesh>

      {/* Barrel — extends prominently past slide */}
      <mesh position={[0, 0.025, -0.30]}>
        <boxGeometry args={[0.038, 0.038, 0.22]} />
        {dark()}
      </mesh>

      {/* Frame / lower receiver */}
      <mesh position={[0, -0.01, 0.00]}>
        <boxGeometry args={[0.078, 0.052, 0.20]} />
        {chrome(0.25)}
      </mesh>

      {/* Trigger guard — large loop */}
      <mesh position={[0, -0.042, 0.01]}>
        <boxGeometry args={[0.058, 0.016, 0.095]} />
        {chrome(0.3)}
      </mesh>

      {/* Grip — chunky, checkered */}
      <mesh position={[0, -0.125, 0.08]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.075, 0.155, 0.105]} />
        {gunMat('#1a1a1a', 0.1, 0.95)}
      </mesh>

      {/* Rear sight — wide notch block */}
      <mesh position={[0, 0.098, 0.08]}>
        <boxGeometry args={[0.065, 0.022, 0.018]} />
        {dark()}
      </mesh>

      {/* Front sight — tall post */}
      <mesh position={[0, 0.098, -0.22]}>
        <boxGeometry args={[0.014, 0.026, 0.012]} />
        {dark()}
      </mesh>

      {/* Rear serrations on slide (3 thin slabs) */}
      {[-0.02, 0.02, 0.06].map((z, i) => (
        <mesh key={i} position={[0.044, 0.04, z]}>
          <boxGeometry args={[0.006, 0.065, 0.012]} />
          {chrome(0.4)}
        </mesh>
      ))}
    </>
  )
}

function ShotgunModel({ gunMat, pumpRef }) {
  const metal = (c) => gunMat(c, 0.75, 0.3)
  const wood  = (c) => gunMat(c, 0.0,  0.9)
  return (
    <>
      {/* Receiver / action block — wide and tall */}
      <mesh position={[0, 0.022, 0.02]}>
        <boxGeometry args={[0.120, 0.100, 0.22]} />
        {metal('#2e2e2e')}
      </mesh>

      {/* Main barrel — thick */}
      <mesh position={[0, 0.028, -0.36]}>
        <boxGeometry args={[0.058, 0.058, 0.54]} />
        {metal('#252525')}
      </mesh>

      {/* Muzzle end cap — pronounced flare */}
      <mesh position={[0, 0.028, -0.640]}>
        <boxGeometry args={[0.072, 0.072, 0.036]} />
        {metal('#333')}
      </mesh>

      {/* Tubular magazine under barrel — thick */}
      <mesh position={[0, -0.024, -0.30]}>
        <boxGeometry args={[0.048, 0.048, 0.46]} />
        {metal('#303030')}
      </mesh>

      {/* Pump / forend — chunky wood grip, animated on shot */}
      <mesh ref={pumpRef} position={[0, -0.012, -0.24]}>
        <boxGeometry args={[0.095, 0.075, 0.20]} />
        {wood('#5a3010')}
      </mesh>

      {/* Wood stock — wide and solid */}
      <mesh position={[0, -0.004, 0.205]} rotation={[-0.05, 0, 0]}>
        <boxGeometry args={[0.090, 0.100, 0.25]} />
        {wood('#5a3010')}
      </mesh>
      {/* Stock toe */}
      <mesh position={[0, -0.022, 0.330]} rotation={[-0.14, 0, 0]}>
        <boxGeometry args={[0.086, 0.075, 0.08]} />
        {wood('#4e2a0c')}
      </mesh>

      {/* Pistol grip wrist */}
      <mesh position={[0, -0.058, 0.105]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.082, 0.068, 0.10]} />
        {wood('#4a2808')}
      </mesh>

      {/* Trigger guard */}
      <mesh position={[0, -0.050, 0.022]}>
        <boxGeometry args={[0.068, 0.016, 0.10]} />
        {metal('#3a3a3a')}
      </mesh>

      {/* Front bead sight */}
      <mesh position={[0, 0.063, -0.60]}>
        <boxGeometry args={[0.014, 0.018, 0.012]} />
        {gunMat('#aaa', 0.9, 0.2)}
      </mesh>

      {/* Shell ejection port */}
      <mesh position={[0.063, 0.024, 0.01]}>
        <boxGeometry args={[0.008, 0.038, 0.08]} />
        {metal('#1a1a1a')}
      </mesh>
    </>
  )
}

export default function Gun() {
  const { camera } = useThree()
  const weapon = useGameStore((s) => s.weapon)
  const isAK = weapon === 'ak47'
  const isDeagle = weapon === 'deagle'
  const isShotgun = weapon === 'shotgun'

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
  const pumpRef = useRef()
  const recoil = useRef(0)
  const flashLife = useRef(0)
  const pumpAnim = useRef(0)

  Gun.fire = () => {
    recoil.current = 1
    flashLife.current = 1
  }

  Gun.pump = () => { pumpAnim.current = 1 }

  Gun.getMuzzlePosition = () => _muzzleWorld.clone()

  useFrame(({ gl, scene, size }, delta) => {
    weaponCamera.aspect = size.width / size.height
    weaponCamera.updateProjectionMatrix()

    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 10)
    if (flashRef.current) {
      flashLife.current = Math.max(0, flashLife.current - delta * 20)
      flashRef.current.intensity = flashLife.current * 4
    }

    // Pump animation: sine arc so forend slides back then snaps forward
    if (pumpAnim.current > 0) {
      pumpAnim.current = Math.max(0, pumpAnim.current - delta / 0.42)
      if (pumpRef.current) {
        const t = 1 - pumpAnim.current
        pumpRef.current.position.z = -0.24 + Math.sin(t * Math.PI) * 0.14
      }
    }

    if (groupRef.current) {
      if (isAK) {
        const recoilZ = recoil.current * 0.04
        const recoilAngle = recoil.current * 0.10
        groupRef.current.position.set(0.10, -0.26, -(0.30 - recoilZ))
        groupRef.current.rotation.set(recoilAngle, 0, 0)
      } else if (isDeagle) {
        const recoilZ = recoil.current * 0.05
        const recoilAngle = recoil.current * 0.22
        groupRef.current.position.set(0.21, -0.21, -(0.36 - recoilZ))
        groupRef.current.rotation.set(recoilAngle, 0, 0)
      } else if (isShotgun) {
        const recoilZ = recoil.current * 0.05
        const recoilAngle = recoil.current * 0.14
        groupRef.current.position.set(0.11, -0.27, -(0.28 - recoilZ))
        groupRef.current.rotation.set(recoilAngle, 0, 0)
      } else {
        const recoilZ = recoil.current * 0.06
        const recoilAngle = recoil.current * 0.18
        groupRef.current.position.set(0.22, -0.22, -(0.38 - recoilZ))
        groupRef.current.rotation.set(recoilAngle, 0, 0)
      }
      groupRef.current.updateMatrixWorld()
    }

    const muzzleLocal = isAK
      ? new THREE.Vector3(0.10, -0.237, -0.82)
      : isDeagle
        ? new THREE.Vector3(0.21, -0.195, -0.73)
        : isShotgun
          ? new THREE.Vector3(0.11, -0.245, -0.75)
          : new THREE.Vector3(0.22, -0.20, -0.69)
    muzzleLocal.applyMatrix4(camera.matrixWorld)
    _muzzleWorld.copy(muzzleLocal)

    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()
    gl.render(weaponScene, weaponCamera)
    gl.autoClear = true
  }, 1)

  const gunMat = (color, metalness = 0.7, roughness = 0.3) => (
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  )

  const flashZ = isAK ? -0.65 : isDeagle ? -0.40 : isShotgun ? -0.58 : -0.31

  return createPortal(
    <group ref={groupRef}>
      {isAK ? <AKModel gunMat={gunMat} /> : isDeagle ? <DeagleModel gunMat={gunMat} /> : isShotgun ? <ShotgunModel gunMat={gunMat} pumpRef={pumpRef} /> : <PistolModel gunMat={gunMat} />}
      <pointLight ref={flashRef} position={[0, 0.03, flashZ]} intensity={0} color="#ff9900" distance={4} />
    </group>,
    weaponScene
  )
}
