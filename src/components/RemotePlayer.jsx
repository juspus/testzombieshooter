import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'

// ── Position ring buffer (written by NetManager, read by useFrame) ────────
const _buffer = []  // { t: ms, x, y, z, yaw }
const INTERP_DELAY = 100  // render this many ms in the past; must be > send interval (33ms)
const MAX_SAMPLES  = 60   // ~2s at 30/s

// Current interpolated remote player position — read by ZombieComponent for targeting
let _currentPos = null
export function getRemotePlayerPos() { return _currentPos }

export function pushRemotePlayerSample(sample) {
  _buffer.push({ t: performance.now(), ...sample })
  if (_buffer.length > MAX_SAMPLES) _buffer.shift()
}

// ── Shortest-arc angle lerp (handles ±π wrap) ─────────────────────────────
function lerpAngle(a, b, t) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI
  return a + d * t
}

// ── Component ──────────────────────────────────────────────────────────────
export default function RemotePlayer() {
  const groupRef   = useRef()
  const mpConnected = useGameStore((s) => s.mpConnected)

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

    // ── Find the two bracketing samples ──────────────────────────────────
    let lo = -1
    for (let i = 0; i < _buffer.length - 1; i++) {
      if (_buffer[i].t <= renderTime) lo = i
    }

    if (lo >= 0 && lo < _buffer.length - 1) {
      // ── Interpolate between lo and lo+1 ──────────────────────────────
      const a = _buffer[lo], b = _buffer[lo + 1]
      const alpha = Math.max(0, Math.min(1, (renderTime - a.t) / (b.t - a.t)))
      g.position.x = a.x + (b.x - a.x) * alpha
      g.position.z = a.z + (b.z - a.z) * alpha
      g.rotation.y = lerpAngle(a.yaw, b.yaw, alpha)
    } else if (_buffer.length >= 2) {
      // ── Dead reckoning: extrapolate from last two samples ─────────────
      const a = _buffer[_buffer.length - 2]
      const b = _buffer[_buffer.length - 1]
      const dt = b.t - a.t
      if (dt > 0) {
        const ahead = (renderTime - b.t) / dt
        g.position.x = b.x + (b.x - a.x) * ahead
        g.position.z = b.z + (b.z - a.z) * ahead
        g.rotation.y = lerpAngle(a.yaw, b.yaw, 1 + ahead)
      } else {
        g.position.x = b.x
        g.position.z = b.z
        g.rotation.y = b.yaw
      }
    } else {
      // Single sample — just place
      const s = _buffer[0]
      g.position.x = s.x
      g.position.z = s.z
      g.rotation.y = s.yaw
    }

    // Expose current position for zombie targeting
    _currentPos = { x: g.position.x, z: g.position.z }

    // Prune samples older than 2s
    const cutoff = performance.now() - 2000
    while (_buffer.length > 2 && _buffer[0].t < cutoff) _buffer.shift()
  })

  if (!mpConnected) return null

  return (
    <group ref={groupRef} visible={false}>
      {/* Body */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[0.55, 0.8, 0.3]} />
        <meshStandardMaterial color="#44aaff" transparent opacity={0.85} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.19, 8, 8]} />
        <meshStandardMaterial color="#66ccff" transparent opacity={0.85} />
      </mesh>
      {/* Gun barrel hint */}
      <mesh position={[0.22, 1.0, -0.28]}>
        <boxGeometry args={[0.06, 0.06, 0.35]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  )
}
