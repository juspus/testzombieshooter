import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { send } from '../net'
import { getZombiePositions } from './Zombie'
import {
  POWERUP_TYPES, POWERUP_DEFS, POOL_SIZE, PICKUP_RADIUS,
  slots, ageDrops, dropVisible, takeDrop, setPositionProviders, onDropSpawned,
} from '../powerups'
import { playPowerupDrop } from '../sounds'

// Wave 3 power-up pickups: a fixed pool of POOL_SIZE always-mounted floating icons
// (boxes + meshBasicMaterial, shared geometry / materials), toggled via `visible` and
// ref mutation — nothing mounts or unmounts per drop. State lives in powerups.js
// (`slots`); this component only renders it, collects on proximity and ticks timers.

const _boxGeo = new THREE.BoxGeometry(1, 1, 1)
const _beamGeo = new THREE.BoxGeometry(0.1, 3.2, 0.1)
const _ringGeo = new THREE.RingGeometry(0.35, 0.62, 24)
const _mat = {}   // flat colour -> shared MeshBasicMaterial
const m = (c) => (_mat[c] ??= new THREE.MeshBasicMaterial({ color: c }))
const _glow = {}  // per-type additive glow (beam + floor ring)
for (const t of POWERUP_TYPES) {
  _glow[t] = new THREE.MeshBasicMaterial({
    color: POWERUP_DEFS[t].color, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
}

// [w, h, d, x, y, z, colour, rotZ?] per box; icon centred on origin, ~0.5 units wide
const ICONS = {
  max_ammo: [
    [0.56, 0.3, 0.34, 0, -0.08, 0, '#2f9c45'],
    [0.5, 0.05, 0.3, 0, 0.09, 0, '#1d6a2e'],
    [0.09, 0.3, 0.09, -0.16, 0.22, 0, '#ffd34d'],
    [0.09, 0.3, 0.09, 0, 0.22, 0, '#ffd34d'],
    [0.09, 0.3, 0.09, 0.16, 0.22, 0, '#ffd34d'],
  ],
  insta_kill: [
    [0.46, 0.4, 0.4, 0, 0.06, 0, '#e8e2d0'],
    [0.3, 0.14, 0.36, 0, -0.2, 0, '#d4cdb8'],
    [0.12, 0.12, 0.05, -0.12, 0.08, 0.21, '#1a0000'],
    [0.12, 0.12, 0.05, 0.12, 0.08, 0.21, '#1a0000'],
    [0.07, 0.09, 0.05, 0, -0.04, 0.21, '#1a0000'],
    [0.5, 0.06, 0.06, 0, 0.35, 0, '#ff3030'],
  ],
  double_money: [
    [0.5, 0.5, 0.1, 0, 0, 0, '#ffd21a'],
    [0.5, 0.5, 0.1, 0, 0, 0, '#e6a800', Math.PI / 4],
    [0.36, 0.36, 0.13, 0, 0, 0, '#fff0a0'],
    [0.07, 0.3, 0.14, -0.07, 0, 0, '#7a5200'],
    [0.07, 0.3, 0.14, 0.09, 0, 0, '#7a5200', 0.0],
  ],
  nuke: [
    [0.44, 0.44, 0.44, 0, 0, 0, '#ff9a1f'],
    [0.44, 0.44, 0.44, 0, 0, 0, '#ffd21a', Math.PI / 4],
    [0.16, 0.16, 0.5, 0, 0, 0, '#1a1208'],
    [0.5, 0.16, 0.16, 0, 0, 0, '#1a1208'],
  ],
  carpenter: [
    [0.66, 0.13, 0.2, 0, 0, 0, '#c98a4b', 0.5],
    [0.66, 0.13, 0.2, 0, 0, 0.01, '#a8703a', -0.5],
    [0.08, 0.08, 0.26, 0, 0, 0, '#c8ccd0'],
  ],
}

function Icon({ type, visibleRef }) {
  return (
    <group ref={visibleRef} visible={false}>
      {ICONS[type].map(([w, h, d, x, y, z, c, rz], i) => (
        <mesh key={i} geometry={_boxGeo} material={m(c)} scale={[w, h, d]} position={[x, y, z]} rotation={[0, 0, rz ?? 0]} />
      ))}
    </group>
  )
}

function Slot({ index, register }) {
  const root = useRef()
  const icons = useRef({})
  const beam = useRef()
  const ring = useRef()
  useEffect(() => { register(index, { root, icons, beam, ring }) }, [index, register])
  return (
    <group ref={root} visible={false}>
      <group position={[0, 0.9, 0]} scale={1.6}>
        {POWERUP_TYPES.map((t) => <Icon key={t} type={t} visibleRef={(el) => { icons.current[t] = el }} />)}
      </group>
      <mesh ref={beam} geometry={_beamGeo} position={[0, 1.6, 0]} material={_glow.max_ammo} />
      <mesh ref={ring} geometry={_ringGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={_glow.max_ammo} />
    </group>
  )
}

export default function PowerUps() {
  const { camera } = useThree()
  const refs = useRef([])
  const shownType = useRef(new Array(POOL_SIZE).fill(null))
  const shownId = useRef(new Array(POOL_SIZE).fill(0))
  const register = useRef((i, r) => { refs.current[i] = r }).current

  // Providers for the store's drop placement (zombie death spot, player anchor)
  useEffect(() => {
    setPositionProviders(
      (id) => getZombiePositions()[id] ?? null,
      () => ({ x: camera.position.x, z: camera.position.z }),
    )
    // Host: broadcast every new drop to the guest
    const off = onDropSpawned((d) => {
      const s = useGameStore.getState()
      if (s.mpConnected && s.mpRole === 'host') send('powerup_spawn', d)
    })
    return () => { off(); setPositionProviders(null, null) }
  }, [camera])

  useFrame(({ clock }, delta) => {
    const st = useGameStore.getState()
    if (st.paused) return
    const dt = Math.min(delta, 0.05)
    st.tickPowerups(dt)
    ageDrops(dt)
    const t = clock.elapsedTime
    const cx = camera.position.x, cz = camera.position.z
    const canCollect = st.phase === 'playing' || st.phase === 'intermission'
    for (let i = 0; i < POOL_SIZE; i++) {
      const r = refs.current[i]
      if (!r?.root.current) continue
      const s = slots[i]
      const root = r.root.current
      if (!s.active) { if (root.visible) root.visible = false; shownId.current[i] = 0; continue }
      if (shownId.current[i] !== s.id) {
        // newly assigned slot: pick icon + glow colour, announce
        shownId.current[i] = s.id
        if (shownType.current[i] !== s.type) {
          const prev = r.icons.current[shownType.current[i]]
          if (prev) prev.visible = false
          const ic = r.icons.current[s.type]
          if (ic) ic.visible = true
          shownType.current[i] = s.type
          r.beam.current.material = _glow[s.type]
          r.ring.current.material = _glow[s.type]
        }
        playPowerupDrop()
      }
      const vis = dropVisible(s.age)
      root.visible = vis
      root.position.set(s.x, 0, s.z)
      const icon = r.icons.current[s.type]
      if (icon) {
        icon.parent.position.y = 0.95 + Math.sin(t * 2.4 + i) * 0.14
        icon.parent.rotation.y = t * 1.8
      }
      r.ring.current.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.08)

      if (canCollect) {
        const dx = cx - s.x, dz = cz - s.z
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) collect(s, st)
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }, (_, i) => <Slot key={i} index={i} register={register} />)}
    </>
  )
}

// Collect rules: solo / host apply immediately (and tell the guest); a guest asks the
// host, which validates (drop still exists) and broadcasts `powerup_apply` to both.
function collect(slot, st) {
  if (st.mpConnected && st.mpRole === 'guest') {
    const now = performance.now()
    if (now - slot.reqAt < 800) return   // request already in flight
    slot.reqAt = now
    send('powerup_collect', { id: slot.id })
    return
  }
  const d = takeDrop(slot.id)
  if (!d) return
  st.applyPowerup(d.type)
  if (st.mpConnected) send('powerup_apply', { id: d.id, type: d.type })
}
