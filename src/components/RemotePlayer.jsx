import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'

// ── Position ring buffer (written by NetManager, read by useFrame) ────────
const _buffer = []
const INTERP_DELAY = 100  // render this many ms in the past
const MAX_SAMPLES  = 60   // ~2s at 30/s

let _currentPos = null
export function getRemotePlayerPos() { return _currentPos }

export function pushRemotePlayerSample(sample) {
  _buffer.push({ t: performance.now(), ...sample })
  if (_buffer.length > MAX_SAMPLES) _buffer.shift()
}

// ── Shortest-arc angle lerp ───────────────────────────────────────────────
function lerpAngle(a, b, t) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI
  return a + d * t
}

// ── Appearance constants ──────────────────────────────────────────────────
const SHIRT   = '#2b5090'
const PANTS   = '#7a6040'
const SKIN    = '#c8956c'
const HAIR    = '#1c110a'
const BOOTS   = '#1a1210'
const BELT    = '#3a2010'
const METAL   = '#888'
const WOOD    = '#8B5E3C'
const STUBBLE = '#6b4c3b'   // jaw shadow
const EYE     = '#111'
const BUCKLE  = '#b8860b'   // dark-gold belt buckle
const SOLE    = '#0d0d0d'   // rubber boot sole
const CUFF    = '#1e3870'   // slightly darker shirt cuff

// ── Component ─────────────────────────────────────────────────────────────
export default function RemotePlayer() {
  const groupRef    = useRef()
  const mpConnected = useGameStore((s) => s.mpConnected)

  // Body refs for walk animation
  const leftLegRef  = useRef()
  const rightLegRef = useRef()
  const leftArmRef  = useRef()
  const rightArmRef = useRef()
  const headRef     = useRef()

  // Weapon group refs
  const pistolRef   = useRef()
  const ak47Ref     = useRef()
  const deagleRef   = useRef()
  const shotgunRef  = useRef()
  const knifeRef    = useRef()

  // Walk state
  const walkPhase = useRef(0)
  const lastPos   = useRef(null)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return

    if (!mpConnected || _buffer.length === 0) {
      g.visible = false
      _currentPos = null
      return
    }
    g.visible = true

    const renderTime = performance.now() - INTERP_DELAY

    // ── Find bracketing samples ───────────────────────────────────────────
    let lo = -1
    for (let i = 0; i < _buffer.length - 1; i++) {
      if (_buffer[i].t <= renderTime) lo = i
    }

    let px, pz, pyaw, sampleWeapon, sampleActiveItem

    if (lo >= 0 && lo < _buffer.length - 1) {
      const a = _buffer[lo], b = _buffer[lo + 1]
      const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / (b.t - a.t)))
      px   = a.x + (b.x - a.x) * alpha
      pz   = a.z + (b.z - a.z) * alpha
      pyaw = lerpAngle(a.yaw, b.yaw, alpha)
      sampleWeapon     = b.weapon
      sampleActiveItem = b.activeItem
    } else if (_buffer.length >= 2) {
      const a = _buffer[_buffer.length - 2]
      const b = _buffer[_buffer.length - 1]
      const dt = b.t - a.t
      if (dt > 0) {
        const ahead = (renderTime - b.t) / dt
        px   = b.x + (b.x - a.x) * ahead
        pz   = b.z + (b.z - a.z) * ahead
        pyaw = lerpAngle(a.yaw, b.yaw, 1 + ahead)
      } else {
        px = b.x; pz = b.z; pyaw = b.yaw
      }
      sampleWeapon     = _buffer[_buffer.length - 1].weapon
      sampleActiveItem = _buffer[_buffer.length - 1].activeItem
    } else {
      const s = _buffer[0]
      px = s.x; pz = s.z; pyaw = s.yaw
      sampleWeapon     = s.weapon
      sampleActiveItem = s.activeItem
    }

    g.position.x = px
    g.position.z = pz
    g.rotation.y = pyaw

    _currentPos = { x: px, z: pz }

    // ── Walk animation ────────────────────────────────────────────────────
    const lp = lastPos.current
    if (lp) {
      const dx = px - lp.x, dz = pz - lp.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 0.008) {
        walkPhase.current += dist * 1.4   // ~1.8 Hz at max walk speed
      } else {
        walkPhase.current *= 0.88         // damp to rest when standing still
      }
    }
    lastPos.current = { x: px, z: pz }

    const swing = Math.sin(walkPhase.current)
    if (leftLegRef.current)  leftLegRef.current.rotation.x  =  swing * 0.38
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing * 0.38
    if (leftArmRef.current)  leftArmRef.current.rotation.x  = -swing * 0.28
    if (rightArmRef.current) rightArmRef.current.rotation.x =  swing * 0.28

    // ── Weapon visibility ─────────────────────────────────────────────────
    const showKnife = sampleActiveItem === 'knife'
    if (pistolRef.current)  pistolRef.current.visible  = !showKnife && sampleWeapon === 'pistol'
    if (ak47Ref.current)    ak47Ref.current.visible    = !showKnife && sampleWeapon === 'ak47'
    if (deagleRef.current)  deagleRef.current.visible  = !showKnife && sampleWeapon === 'deagle'
    if (shotgunRef.current) shotgunRef.current.visible = !showKnife && sampleWeapon === 'shotgun'
    if (knifeRef.current)   knifeRef.current.visible   = showKnife

    // Prune old samples
    const cutoff = performance.now() - 2000
    while (_buffer.length > 2 && _buffer[0].t < cutoff) _buffer.shift()
  })

  if (!mpConnected) return null

  // Right arm holds the weapon; position offset right side of chest
  // All weapon groups share the same local-space transform on rightArmRef

  return (
    <group ref={groupRef} visible={false}>

      {/* ── Torso / shirt ── */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.52, 0.72, 0.28]} />
        <meshStandardMaterial color={SHIRT} />
      </mesh>
      {/* Shirt collar band */}
      <mesh position={[0, 1.43, -0.135]}>
        <boxGeometry args={[0.22, 0.05, 0.02]} />
        <meshStandardMaterial color={CUFF} />
      </mesh>
      {/* Left collar flap */}
      <mesh position={[-0.05, 1.40, -0.142]}>
        <boxGeometry args={[0.08, 0.10, 0.015]} />
        <meshStandardMaterial color={CUFF} />
      </mesh>
      {/* Right collar flap */}
      <mesh position={[0.05, 1.40, -0.142]}>
        <boxGeometry args={[0.08, 0.10, 0.015]} />
        <meshStandardMaterial color={CUFF} />
      </mesh>
      {/* Chest pocket */}
      <mesh position={[-0.13, 1.18, -0.143]}>
        <boxGeometry args={[0.09, 0.08, 0.015]} />
        <meshStandardMaterial color={CUFF} />
      </mesh>
      {/* Pocket flap */}
      <mesh position={[-0.13, 1.225, -0.143]}>
        <boxGeometry args={[0.09, 0.02, 0.015]} />
        <meshStandardMaterial color={CUFF} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[0.54, 0.07, 0.30]} />
        <meshStandardMaterial color={BELT} />
      </mesh>
      {/* Belt buckle */}
      <mesh position={[0, 0.68, -0.156]}>
        <boxGeometry args={[0.07, 0.055, 0.015]} />
        <meshStandardMaterial color={BUCKLE} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* ── Head ── */}
      <group ref={headRef} position={[0, 1.58, 0]}>
        {/* Face */}
        <mesh>
          <boxGeometry args={[0.32, 0.34, 0.30]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Jaw / chin — slightly darker for stubble */}
        <mesh position={[0, -0.10, -0.148]}>
          <boxGeometry args={[0.26, 0.09, 0.018]} />
          <meshStandardMaterial color={STUBBLE} />
        </mesh>
        {/* Left eye */}
        <mesh position={[-0.09, 0.04, -0.154]}>
          <boxGeometry args={[0.065, 0.05, 0.015]} />
          <meshStandardMaterial color={EYE} />
        </mesh>
        {/* Right eye */}
        <mesh position={[0.09, 0.04, -0.154]}>
          <boxGeometry args={[0.065, 0.05, 0.015]} />
          <meshStandardMaterial color={EYE} />
        </mesh>
        {/* Left eyebrow */}
        <mesh position={[-0.09, 0.11, -0.154]}>
          <boxGeometry args={[0.075, 0.02, 0.012]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Right eyebrow */}
        <mesh position={[0.09, 0.11, -0.154]}>
          <boxGeometry args={[0.075, 0.02, 0.012]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, 0.01, -0.163]}>
          <boxGeometry args={[0.05, 0.06, 0.025]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Left ear */}
        <mesh position={[-0.172, 0.02, 0.02]}>
          <boxGeometry args={[0.025, 0.07, 0.05]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Right ear */}
        <mesh position={[0.172, 0.02, 0.02]}>
          <boxGeometry args={[0.025, 0.07, 0.05]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Hair top */}
        <mesh position={[0, 0.19, 0]}>
          <boxGeometry args={[0.34, 0.10, 0.32]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Hair back */}
        <mesh position={[0, 0.10, 0.14]}>
          <boxGeometry args={[0.30, 0.20, 0.06]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Left sideburn */}
        <mesh position={[-0.172, 0.06, 0.06]}>
          <boxGeometry args={[0.025, 0.14, 0.09]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Right sideburn */}
        <mesh position={[0.172, 0.06, 0.06]}>
          <boxGeometry args={[0.025, 0.14, 0.09]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
      </group>

      {/* ── Neck ── */}
      <mesh position={[0, 1.40, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* ── Left arm (swings with walk) ── */}
      <group ref={leftArmRef} position={[-0.32, 1.08, 0]}>
        {/* Shoulder cap */}
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.17, 0.07, 0.17]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Upper arm */}
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[0.14, 0.30, 0.14]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Elbow bump */}
        <mesh position={[0, -0.30, 0.04]}>
          <boxGeometry args={[0.13, 0.07, 0.07]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0, -0.42, 0]}>
          <boxGeometry args={[0.11, 0.22, 0.11]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Shirt cuff */}
        <mesh position={[0, -0.525, 0]}>
          <boxGeometry args={[0.13, 0.04, 0.13]} />
          <meshStandardMaterial color={CUFF} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.60, -0.01]}>
          <boxGeometry args={[0.10, 0.08, 0.10]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
      </group>

      {/* ── Right arm (weapon arm, swings with walk) ── */}
      <group ref={rightArmRef} position={[0.32, 1.08, 0]}>
        {/* Shoulder cap */}
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.17, 0.07, 0.17]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Upper arm */}
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[0.14, 0.30, 0.14]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Elbow bump */}
        <mesh position={[0, -0.30, 0.04]}>
          <boxGeometry args={[0.13, 0.07, 0.07]} />
          <meshStandardMaterial color={SHIRT} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0, -0.42, 0]}>
          <boxGeometry args={[0.11, 0.22, 0.11]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Shirt cuff */}
        <mesh position={[0, -0.525, 0]}>
          <boxGeometry args={[0.13, 0.04, 0.13]} />
          <meshStandardMaterial color={CUFF} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.60, -0.01]}>
          <boxGeometry args={[0.10, 0.08, 0.10]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>

        {/* ── Weapons (attached to right hand) ── */}

        {/* Pistol */}
        <group ref={pistolRef} position={[0.02, -0.64, -0.10]} visible={false}>
          {/* Grip */}
          <mesh>
            <boxGeometry args={[0.07, 0.14, 0.07]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Slide / barrel */}
          <mesh position={[0, 0.06, -0.09]}>
            <boxGeometry args={[0.055, 0.055, 0.20]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Trigger guard */}
          <mesh position={[0, -0.04, -0.05]}>
            <boxGeometry args={[0.03, 0.025, 0.09]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Front sight */}
          <mesh position={[0, 0.095, -0.185]}>
            <boxGeometry args={[0.015, 0.02, 0.01]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
        </group>

        {/* Deagle */}
        <group ref={deagleRef} position={[0.02, -0.64, -0.10]} visible={false}>
          {/* Grip */}
          <mesh>
            <boxGeometry args={[0.08, 0.17, 0.08]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Slide / barrel (heftier) */}
          <mesh position={[0, 0.07, -0.13]}>
            <boxGeometry args={[0.065, 0.07, 0.26]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Trigger guard */}
          <mesh position={[0, -0.04, -0.06]}>
            <boxGeometry args={[0.03, 0.025, 0.10]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Rear sight */}
          <mesh position={[0, 0.11, 0.00]}>
            <boxGeometry args={[0.055, 0.025, 0.02]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Front sight */}
          <mesh position={[0, 0.11, -0.245]}>
            <boxGeometry args={[0.015, 0.025, 0.01]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
        </group>

        {/* AK-47 */}
        <group ref={ak47Ref} position={[0.02, -0.58, -0.14]} visible={false}>
          {/* Stock */}
          <mesh position={[0, 0, 0.21]}>
            <boxGeometry args={[0.06, 0.10, 0.24]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Stock cheek rest */}
          <mesh position={[0, 0.06, 0.18]}>
            <boxGeometry args={[0.06, 0.04, 0.16]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Receiver body */}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.07, 0.10, 0.28]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Handguard (wood) */}
          <mesh position={[0, 0.00, -0.17]}>
            <boxGeometry args={[0.065, 0.08, 0.16]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Barrel */}
          <mesh position={[0, 0.03, -0.30]}>
            <boxGeometry args={[0.035, 0.04, 0.32]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Gas tube */}
          <mesh position={[0, 0.07, -0.20]}>
            <boxGeometry args={[0.025, 0.025, 0.22]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Magazine */}
          <mesh position={[0, -0.09, 0.04]}>
            <boxGeometry args={[0.05, 0.16, 0.07]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Front sight post */}
          <mesh position={[0, 0.075, -0.455]}>
            <boxGeometry args={[0.03, 0.06, 0.03]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
        </group>

        {/* Shotgun */}
        <group ref={shotgunRef} position={[0.02, -0.58, -0.14]} visible={false}>
          {/* Stock */}
          <mesh position={[0, 0, 0.24]}>
            <boxGeometry args={[0.07, 0.11, 0.26]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Receiver */}
          <mesh position={[0, 0.01, 0.04]}>
            <boxGeometry args={[0.09, 0.09, 0.22]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Pump handguard */}
          <mesh position={[0, -0.01, -0.10]}>
            <boxGeometry args={[0.085, 0.07, 0.14]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Double barrel */}
          <mesh position={[0.022, 0.025, -0.28]}>
            <boxGeometry args={[0.03, 0.06, 0.30]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          <mesh position={[-0.022, 0.025, -0.28]}>
            <boxGeometry args={[0.03, 0.06, 0.30]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Shell tube under barrel */}
          <mesh position={[0, -0.03, -0.14]}>
            <boxGeometry args={[0.04, 0.04, 0.26]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
        </group>

        {/* Knife */}
        <group ref={knifeRef} position={[0.02, -0.64, -0.08]} visible={false}>
          {/* Handle / wrap */}
          <mesh>
            <boxGeometry args={[0.06, 0.06, 0.15]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {/* Crossguard */}
          <mesh position={[0, 0.01, -0.09]}>
            <boxGeometry args={[0.11, 0.03, 0.03]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Blade */}
          <mesh position={[0, 0.005, -0.20]}>
            <boxGeometry args={[0.025, 0.055, 0.22]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
          {/* Blade spine (top ridge) */}
          <mesh position={[0, 0.03, -0.20]}>
            <boxGeometry args={[0.01, 0.015, 0.20]} />
            <meshStandardMaterial color={METAL} />
          </mesh>
        </group>

      </group>{/* end rightArmRef */}

      {/* ── Left leg ── */}
      <group ref={leftLegRef} position={[-0.13, 0.62, 0]}>
        {/* Thigh */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.16, 0.34, 0.18]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Cargo pocket on thigh */}
        <mesh position={[-0.085, -0.22, 0]}>
          <boxGeometry args={[0.015, 0.12, 0.12]} />
          <meshStandardMaterial color={BELT} />
        </mesh>
        {/* Knee cap */}
        <mesh position={[0, -0.355, -0.092]}>
          <boxGeometry args={[0.13, 0.07, 0.04]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Shin */}
        <mesh position={[0, -0.47, 0]}>
          <boxGeometry args={[0.13, 0.27, 0.15]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Boot upper */}
        <mesh position={[0, -0.665, 0.025]}>
          <boxGeometry args={[0.15, 0.10, 0.22]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
        {/* Boot tongue detail */}
        <mesh position={[0, -0.64, -0.105]}>
          <boxGeometry args={[0.10, 0.06, 0.02]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
        {/* Boot sole */}
        <mesh position={[0, -0.724, 0.025]}>
          <boxGeometry args={[0.17, 0.03, 0.25]} />
          <meshStandardMaterial color={SOLE} />
        </mesh>
        {/* Boot heel block */}
        <mesh position={[0, -0.695, 0.122]}>
          <boxGeometry args={[0.14, 0.055, 0.055]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
      </group>

      {/* ── Right leg ── */}
      <group ref={rightLegRef} position={[0.13, 0.62, 0]}>
        {/* Thigh */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.16, 0.34, 0.18]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Cargo pocket on thigh */}
        <mesh position={[0.085, -0.22, 0]}>
          <boxGeometry args={[0.015, 0.12, 0.12]} />
          <meshStandardMaterial color={BELT} />
        </mesh>
        {/* Knee cap */}
        <mesh position={[0, -0.355, -0.092]}>
          <boxGeometry args={[0.13, 0.07, 0.04]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Shin */}
        <mesh position={[0, -0.47, 0]}>
          <boxGeometry args={[0.13, 0.27, 0.15]} />
          <meshStandardMaterial color={PANTS} />
        </mesh>
        {/* Boot upper */}
        <mesh position={[0, -0.665, 0.025]}>
          <boxGeometry args={[0.15, 0.10, 0.22]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
        {/* Boot tongue detail */}
        <mesh position={[0, -0.64, -0.105]}>
          <boxGeometry args={[0.10, 0.06, 0.02]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
        {/* Boot sole */}
        <mesh position={[0, -0.724, 0.025]}>
          <boxGeometry args={[0.17, 0.03, 0.25]} />
          <meshStandardMaterial color={SOLE} />
        </mesh>
        {/* Boot heel block */}
        <mesh position={[0, -0.695, 0.122]}>
          <boxGeometry args={[0.14, 0.055, 0.055]} />
          <meshStandardMaterial color={BOOTS} />
        </mesh>
      </group>

    </group>
  )
}
