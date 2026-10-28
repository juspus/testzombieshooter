import { useRef, useMemo } from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import { useGameStore } from '../store'
import { applySkin } from '../cosmetics'
import * as THREE from 'three'
import { feel } from '../cameraFeel'

const _muzzleWorld = new THREE.Vector3()

// Muzzle flash sprite: two additive star meshes (outer orange + hot white core) shared
// across all weapons -- built once, toggled via .visible for ~2 frames per shot.
// meshBasicMaterial + additive: no lighting cost, one shader program for the whole game.
function _starGeo(points, outer, inner) {
  const sh = new THREE.Shape()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? outer : inner
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  sh.closePath()
  return new THREE.ShapeGeometry(sh)
}
const _flashOuterGeo = _starGeo(7, 0.5, 0.16)
const _flashCoreGeo = _starGeo(5, 0.3, 0.1)
const _flashOuterMat = new THREE.MeshBasicMaterial({ color: '#ff9a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
const _flashCoreMat = new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
const FLASH_SIZE = { pistol: 0.16, ak47: 0.2, deagle: 0.26, shotgun: 0.32, crossbow: 0.001 }

// Wave 3 Upgrade Bench: ONE shared emissive material (created at module load) replaces every
// part material of an upgraded gun. Same material type as the normal gun mats => no new shader program.
export const UPGRADED_MAT = new THREE.MeshStandardMaterial({ color: '#2f5f70', emissive: '#14d8ff', emissiveIntensity: 0.85, metalness: 0.6, roughness: 0.35 })
export const upgradedGunMat = () => <primitive object={UPGRADED_MAT} attach="material" />
// Plain (un-skinned) gunMat for props that show weapons outside the viewmodel (Mystery Box, bench, playground).
export const plainGunMat = (color, metalness = 0.7, roughness = 0.3) => (
  <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
)

export function PistolModel({ gunMat }) {
  return (
    <>
      {/* Slide / upper receiver */}
      <mesh position={[0, 0.04, -0.04]}>
        <boxGeometry args={[0.065, 0.055, 0.26]} />
        {gunMat('#585858', 0.7, 0.3, 'metal')}
      </mesh>
      {/* Lower frame */}
      <mesh position={[0, -0.01, 0.02]}>
        <boxGeometry args={[0.06, 0.045, 0.18]} />
        {gunMat('#636363', 0.5, 0.4, 'metal')}
      </mesh>
      {/* Barrel */}
      <mesh position={[0, 0.02, -0.22]}>
        <boxGeometry args={[0.032, 0.032, 0.18]} />
        {gunMat('#444', 0.9, 0.15, 'dark')}
      </mesh>
      {/* Grip */}
      <mesh position={[0, -0.1, 0.06]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[0.058, 0.13, 0.082]} />
        {gunMat('#3a3a3a', 0.1, 0.95, 'grip')}
      </mesh>
      {/* Trigger guard */}
      <mesh position={[0, -0.035, 0.02]}>
        <boxGeometry args={[0.045, 0.014, 0.075]} />
        {gunMat('#555', 0.4, 0.5, 'dark')}
      </mesh>
      {/* Sight rear */}
      <mesh position={[0, 0.075, 0.08]}>
        <boxGeometry args={[0.05, 0.018, 0.014]} />
        {gunMat('#666', 0.6, 0.3, 'accent')}
      </mesh>
      {/* Sight front */}
      <mesh position={[0, 0.075, -0.14]}>
        <boxGeometry args={[0.01, 0.018, 0.01]} />
        {gunMat('#666', 0.6, 0.3, 'accent')}
      </mesh>
    </>
  )
}

export function AKModel({ gunMat }) {
  const metal  = (color) => gunMat(color, 0.8, 0.25, 'metal')
  const dark   = (color) => gunMat(color, 0.8, 0.25, 'dark')
  const wood   = (color) => gunMat(color, 0.0, 0.92, 'wood')
  const grip   = ()      => gunMat('#252525', 0.1, 0.9, 'grip')
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
        {dark('#444')}
      </mesh>

      {/* Banana magazine — 3 angled segments */}
      <mesh position={[0, -0.088, -0.055]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.058, 0.055, 0.075]} />
        {dark('#2a2a1a')}
      </mesh>
      <mesh position={[0, -0.148, -0.080]} rotation={[-0.20, 0, 0]}>
        <boxGeometry args={[0.056, 0.068, 0.085]} />
        {dark('#2a2a1a')}
      </mesh>
      <mesh position={[0, -0.208, -0.092]} rotation={[-0.30, 0, 0]}>
        <boxGeometry args={[0.054, 0.042, 0.055]} />
        {dark('#252515')}
      </mesh>

      {/* Front sight post */}
      <mesh position={[0, 0.068, -0.64]}>
        <boxGeometry args={[0.036, 0.065, 0.038]} />
        {dark('#333')}
      </mesh>

      {/* Rear sight */}
      <mesh position={[0, 0.068, -0.02]}>
        <boxGeometry args={[0.055, 0.024, 0.038]} />
        {dark('#444')}
      </mesh>
    </>
  )
}

export function DeagleModel({ gunMat }) {
  const chrome = (r = 0.15) => gunMat('#aaaaaa', 0.9, r, 'chrome')
  const dark   = ()         => gunMat('#2e2e2e', 0.8, 0.2, 'dark')
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
        {gunMat('#1a1a1a', 0.1, 0.95, 'grip')}
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

export function ShotgunModel({ gunMat, pumpRef }) {
  const metal = (c) => gunMat(c, 0.75, 0.3, 'metal')
  const dark  = (c) => gunMat(c, 0.75, 0.3, 'dark')
  const wood  = (c) => gunMat(c, 0.0,  0.9, 'wood')
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
        {dark('#333')}
      </mesh>

      {/* Tubular magazine under barrel — thick */}
      <mesh position={[0, -0.024, -0.30]}>
        <boxGeometry args={[0.048, 0.048, 0.46]} />
        {dark('#303030')}
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
        {dark('#3a3a3a')}
      </mesh>

      {/* Front bead sight */}
      <mesh position={[0, 0.063, -0.60]}>
        <boxGeometry args={[0.014, 0.018, 0.012]} />
        {gunMat('#aaa', 0.9, 0.2, 'accent')}
      </mesh>

      {/* Shell ejection port */}
      <mesh position={[0.063, 0.024, 0.01]}>
        <boxGeometry args={[0.008, 0.038, 0.08]} />
        {dark('#1a1a1a')}
      </mesh>
    </>
  )
}

export function FlamethrowerModel({ gunMat }) {
  const metal = (c) => gunMat(c, 0.75, 0.35, 'metal')
  const dark  = (c) => gunMat(c, 0.75, 0.35, 'dark')
  const tank  = (c) => gunMat(c, 0.6, 0.4, 'accent')
  return (
    <>
      {/* Fuel tank — large cylinder slung under/behind the nozzle */}
      <mesh position={[0.01, -0.05, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.085, 0.085, 0.34, 16]} />
        {tank('#5a1f12')}
      </mesh>
      {/* Tank end caps */}
      <mesh position={[0.01, -0.05, -0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.02, 16]} />
        {dark('#3a3a3a')}
      </mesh>
      <mesh position={[0.01, -0.05, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.02, 16]} />
        {dark('#3a3a3a')}
      </mesh>
      {/* Tank stencil stripe */}
      <mesh position={[0.01, -0.012, 0.16]}>
        <boxGeometry args={[0.005, 0.02, 0.30]} />
        {gunMat('#d9b400', 0.2, 0.7, 'accent')}
      </mesh>
      {/* Pressure gauge */}
      <mesh position={[0.01, 0.03, 0.02]}>
        <cylinderGeometry args={[0.022, 0.022, 0.025, 10]} />
        {metal('#888')}
      </mesh>

      {/* Main receiver block, bridges tank to nozzle */}
      <mesh position={[0, 0.02, -0.06]}>
        <boxGeometry args={[0.090, 0.085, 0.16]} />
        {metal('#3c3c3c')}
      </mesh>

      {/* Fuel hose — curves from tank to receiver */}
      <mesh position={[0.045, -0.005, 0.05]} rotation={[0.2, 0, 0.35]}>
        <cylinderGeometry args={[0.018, 0.018, 0.20, 8]} />
        {gunMat('#1a1a1a', 0.2, 0.85, 'dark')}
      </mesh>

      {/* Igniter housing */}
      <mesh position={[0, 0.035, -0.16]}>
        <boxGeometry args={[0.060, 0.050, 0.06]} />
        {metal('#2e2e2e')}
      </mesh>
      {/* Pilot light glow */}
      <mesh position={[0, 0.035, -0.20]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#ff6a00" emissive="#ff6a00" emissiveIntensity={2.5} />
      </mesh>

      {/* Nozzle barrel — wide tapering tube */}
      <mesh position={[0, 0.03, -0.42]}>
        <cylinderGeometry args={[0.040, 0.052, 0.46, 12]} />
        {metal('#2a2a2a')}
      </mesh>
      {/* Nozzle tip flare */}
      <mesh position={[0, 0.03, -0.66]}>
        <cylinderGeometry args={[0.034, 0.046, 0.06, 12]} />
        {metal('#1f1f1f')}
      </mesh>
      {/* Nozzle rim */}
      <mesh position={[0, 0.03, -0.695]}>
        <cylinderGeometry args={[0.036, 0.036, 0.015, 12]} />
        {metal('#444')}
      </mesh>

      {/* Pistol grip */}
      <mesh position={[0, -0.105, -0.02]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.060, 0.135, 0.075]} />
        {gunMat('#1c1c1c', 0.1, 0.9, 'grip')}
      </mesh>
      {/* Trigger guard */}
      <mesh position={[0, -0.045, -0.05]}>
        <boxGeometry args={[0.046, 0.014, 0.085]} />
        {dark('#3a3a3a')}
      </mesh>

      {/* Shoulder strap mount */}
      <mesh position={[0.01, -0.05, 0.33]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.03, 0.006, 6, 10]} />
        {dark('#222')}
      </mesh>
    </>
  )
}

// Crossbow (Mystery Box exclusive): wooden stock, steel prod + string, one bolt on the rail.
// `boltRef` lets the viewmodel hide the bolt while the crossbow is unloaded.
export function CrossbowModel({ gunMat, boltRef }) {
  const wood = (c) => gunMat(c, 0.0, 0.9, 'wood')
  const steel = (c) => gunMat(c, 0.8, 0.3, 'metal')
  return (
    <>
      {/* Stock */}
      <mesh position={[0, -0.005, 0.12]}>
        <boxGeometry args={[0.05, 0.065, 0.52]} />
        {wood('#5a3416')}
      </mesh>
      {/* Grip */}
      <mesh position={[0, -0.095, 0.12]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.045, 0.12, 0.06]} />
        {wood('#3e2410')}
      </mesh>
      {/* Rail / flight groove */}
      <mesh position={[0, 0.034, -0.14]}>
        <boxGeometry args={[0.03, 0.02, 0.5]} />
        {steel('#555')}
      </mesh>
      {/* Prod (limbs), swept forward at the tips */}
      <mesh position={[-0.1, 0.04, -0.29]} rotation={[0, 0.32, 0]}>
        <boxGeometry args={[0.2, 0.024, 0.034]} />
        {steel('#2d2d30')}
      </mesh>
      <mesh position={[0.1, 0.04, -0.29]} rotation={[0, -0.32, 0]}>
        <boxGeometry args={[0.2, 0.024, 0.034]} />
        {steel('#2d2d30')}
      </mesh>
      {/* Stirrup */}
      <mesh position={[0, 0.0, -0.4]}>
        <boxGeometry args={[0.06, 0.02, 0.05]} />
        {steel('#444')}
      </mesh>
      {/* String */}
      <mesh position={[0, 0.04, -0.23]}>
        <boxGeometry args={[0.34, 0.004, 0.004]} />
        {gunMat('#d8cfae', 0, 1, 'accent')}
      </mesh>
      {/* Bolt */}
      <group ref={boltRef}>
        <mesh position={[0, 0.052, -0.17]}>
          <boxGeometry args={[0.011, 0.011, 0.42]} />
          {steel('#aaa')}
        </mesh>
        <mesh position={[0, 0.052, -0.4]}>
          <boxGeometry args={[0.022, 0.022, 0.05]} />
          {steel('#ddd')}
        </mesh>
        <mesh position={[0, 0.052, 0.02]}>
          <boxGeometry args={[0.04, 0.012, 0.05]} />
          {gunMat('#a33', 0, 0.9, 'accent')}
        </mesh>
      </group>
    </>
  )
}

export default function Gun() {
  const { camera } = useThree()
  const weapon = useGameStore((s) => s.weapon)
  const activeItem = useGameStore((s) => s.activeItem)
  const skin = useGameStore((s) => s.cosmetics.skin)  // cosmetic only; read once here, not in the factory
  const isAK = weapon === 'ak47'
  const isDeagle = weapon === 'deagle'
  const isShotgun = weapon === 'shotgun'
  const isFlamethrower = weapon === 'flamethrower'
  const isCrossbow = weapon === 'crossbow'
  const upgraded = useGameStore((s) => !!s.upgradedWeapons[s.weapon])  // Upgrade Bench glow
  const boltRef = useRef()

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
  const flashSpriteRef = useRef()
  const pumpRef = useRef()
  const recoil = useRef(0)
  const flashLife = useRef(0)
  const pumpAnim = useRef(0)
  const flameActive = useRef(false)
  const flameTime = useRef(0)

  Gun.fire = () => {
    recoil.current = 1
    flashLife.current = 1
    if (flashSpriteRef.current) flashSpriteRef.current.rotation.z = Math.random() * Math.PI * 2
  }

  Gun.pump = () => { pumpAnim.current = 1 }

  Gun.setFlameActive = (active) => { flameActive.current = active }

  Gun.getMuzzlePosition = () => _muzzleWorld.clone()

  useFrame(({ gl, scene, size }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    weaponCamera.aspect = size.width / size.height
    weaponCamera.updateProjectionMatrix()

    if (recoil.current > 0) recoil.current = Math.max(0, recoil.current - delta * 10)
    if (flashRef.current) {
      if (isFlamethrower) {
        if (flameActive.current) {
          flameTime.current += delta
          flashRef.current.intensity = 3 + Math.sin(flameTime.current * 40) * 1.2 + Math.random() * 0.6
        } else {
          flashRef.current.intensity = 0
        }
      } else {
        flashLife.current = Math.max(0, flashLife.current - delta * 20)
        flashRef.current.intensity = isCrossbow ? 0 : flashLife.current * 4
      }
    }
    // Sprite shows for the first ~2 frames of the flash only
    if (flashSpriteRef.current) flashSpriteRef.current.visible = !isFlamethrower && !isCrossbow && flashLife.current > 0.4

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
      } else if (isFlamethrower) {
        // Continuous low-amplitude jitter while spraying instead of a discrete recoil kick
        const jitterX = flameActive.current ? Math.sin(flameTime.current * 23) * 0.006 : 0
        const jitterY = flameActive.current ? Math.cos(flameTime.current * 17) * 0.005 : 0
        groupRef.current.position.set(0.18 + jitterX, -0.25 + jitterY, -0.28)
        groupRef.current.rotation.set(0, 0, 0)
      } else if (isCrossbow) {
        // Hard kick back + muzzle climb, then (while reloading) a cranking wobble and dip
        const st = useGameStore.getState()
        const crank = st.isReloading ? Math.sin(performance.now() * 0.016) : 0
        groupRef.current.position.set(0.17 + crank * 0.006, -0.24 - (st.isReloading ? 0.035 : 0), -(0.5 - recoil.current * 0.11))
        groupRef.current.rotation.set(recoil.current * 0.2 + (st.isReloading ? 0.12 : 0), 0, crank * 0.07)
        if (boltRef.current) boltRef.current.visible = st.bulletsInClip > 0 && !st.isReloading
      } else {
        const recoilZ = recoil.current * 0.06
        const recoilAngle = recoil.current * 0.18
        groupRef.current.position.set(0.22, -0.22, -(0.38 - recoilZ))
        groupRef.current.rotation.set(recoilAngle, 0, 0)
      }
      // Sway (viewmodel lags aim, springs back) + walking bob, from cameraFeel
      const g = groupRef.current
      g.position.x += feel.lagX * 0.8 + feel.gunBobX
      g.position.y += -feel.lagY * 0.8 + feel.gunBobY
      g.rotation.y -= feel.lagX
      g.rotation.x -= feel.lagY
      g.visible = !useGameStore.getState().benchBusy   // the gun is inside the Upgrade Bench
      g.updateMatrixWorld()
    }

    const muzzleLocal = isAK
      ? new THREE.Vector3(0.10, -0.237, -0.82)
      : isDeagle
        ? new THREE.Vector3(0.21, -0.195, -0.73)
        : isShotgun
          ? new THREE.Vector3(0.11, -0.245, -0.75)
          : isFlamethrower
            ? new THREE.Vector3(0.18, -0.22, -0.95)
            : isCrossbow
              ? new THREE.Vector3(0.15, -0.16, -0.7)
              : new THREE.Vector3(0.22, -0.20, -0.69)
    muzzleLocal.applyMatrix4(camera.matrixWorld)
    _muzzleWorld.copy(muzzleLocal)

    // Knife.jsx handles the full render cycle when knife is active
    if (activeItem !== 'gun') return

    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()
    gl.render(weaponScene, weaponCamera)
    gl.autoClear = true
  }, 1)

  // `role` ('metal' | 'dark' | 'wood' | 'grip' | 'chrome' | 'accent') lets a cosmetic skin
  // override color/metalness/roughness. Same material type + props => same shader program.
  // applySkin is a lookup into frozen module-level palettes (no allocation).
  const gunMat = (color, metalness = 0.7, roughness = 0.3, role) => {
    if (upgraded) return upgradedGunMat()
    const o = role ? applySkin(skin, role) : null
    return (
      <meshStandardMaterial
        color={o ? o.color : color}
        metalness={o ? o.metalness : metalness}
        roughness={o ? o.roughness : roughness}
      />
    )
  }

  const flashZ = isCrossbow ? -0.5 : isAK ? -0.65 : isDeagle ? -0.40 : isShotgun ? -0.58 : isFlamethrower ? -0.66 : -0.31

  return createPortal(
    <group ref={groupRef}>
      {isAK ? <AKModel gunMat={gunMat} />
        : isDeagle ? <DeagleModel gunMat={gunMat} />
        : isShotgun ? <ShotgunModel gunMat={gunMat} pumpRef={pumpRef} />
        : isFlamethrower ? <FlamethrowerModel gunMat={gunMat} />
        : isCrossbow ? <CrossbowModel gunMat={gunMat} boltRef={boltRef} />
        : <PistolModel gunMat={gunMat} />}
      <group ref={flashSpriteRef} position={[0, 0.03, flashZ - 0.02]} scale={FLASH_SIZE[weapon] ?? 0.16} visible={false} renderOrder={10}>
        <mesh geometry={_flashOuterGeo} material={_flashOuterMat} />
        <mesh geometry={_flashCoreGeo} material={_flashCoreMat} rotation={[0, 0, 0.5]} scale={0.8} />
      </group>
      <pointLight ref={flashRef} position={[0, 0.03, flashZ]} intensity={0} color={isFlamethrower ? '#ff5500' : '#ff9900'} distance={isFlamethrower ? 6 : 4} />
    </group>,
    weaponScene
  )
}
