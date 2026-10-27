// Display-mode wrappers for the Model Playground. Each component takes
// `ctrl` (a ref holding { id, n }: current animation id + a counter that bumps
// every time an animation button is pressed, so one-shots can restart)
// plus any extra `props` from its registry entry. Feet / base sit at y = 0.
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PistolModel, AKModel, DeagleModel, ShotgunModel, FlamethrowerModel } from '../components/Gun'
import { HuntingKnifeModel } from '../components/Knife'
import { ZombieBody } from '../components/Zombie'
import { PickupMesh } from '../components/BulletPickups'
import RemotePlayer, { pushRemotePlayerSample } from '../components/RemotePlayer'
import { useGameStore } from '../store'
import { getZombieVariant } from '../zombieVariant'

const FEET_OFFSET = 0.866   // ZombieBody origin sits this far above its feet

// ─── Zombie ──────────────────────────────────────────────────────────────────
const FLAME_POS = [[-0.2, 0.25, 0.05], [0.2, 0.3, -0.05], [0, 0.55, 0.1], [0, -0.1, 0.15], [-0.25, -0.35, 0], [0.25, -0.4, 0]]

export function ZombieDisplay({ type, ctrl, variant = 0 }) {
  const outer = useRef()
  const lArm = useRef(), rArm = useRef(), lLeg = useRef(), rLeg = useRef()
  const flames = useRef([])
  const g = useMemo(() => getZombieVariant(type, `pg${variant}`).gait, [type, variant])
  const st = useRef({ t: 0, walk: 0, death: 0, n: -1 })
  const flameGeo = useMemo(() => new THREE.ConeGeometry(0.13, 0.5, 6), [])
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.8, depthWrite: false }), [])

  useFrame((_, dt) => {
    const s = st.current
    const { id, n } = ctrl.current
    if (s.n !== n) { s.n = n; if (id === 'death') s.death = 0 }
    s.t += dt
    const dying = id === 'death'
    s.death = dying ? Math.min(1, s.death + dt / 0.75) : Math.max(0, s.death - dt / 0.3)
    if (outer.current) {
      outer.current.rotation.x = -s.death * (Math.PI / 2)
      outer.current.position.y = s.death * 0.22
    }
    if (!dying || s.death < 1) {
      let la, ra, ll, rl
      if (id === 'attack') {
        const phase = s.t % 1
        const HIGH = 0.9, LOW = -1.05, LIFT = 0.1
        la = ra = phase < LIFT ? LOW + (HIGH - LOW) * (phase / LIFT) : HIGH + (LOW - HIGH) * ((phase - LIFT) / (1 - LIFT))
        ll = rl = 0
      } else if (id === 'walk' || id === 'burning') {
        s.walk += dt * 4
        const w = Math.sin(s.walk)
        ll = Math.sin(s.walk + g.phL) * g.ampL; rl = -Math.sin(s.walk + g.phR) * g.ampR; la = -w * 0.2; ra = w * 0.2
      } else {
        const b = Math.sin(s.t * 1.6) * 0.04
        la = b + 0.05; ra = -b + 0.05; ll = rl = 0
      }
      if (lArm.current) lArm.current.rotation.x = la
      if (rArm.current) rArm.current.rotation.x = ra
      if (lLeg.current) lLeg.current.rotation.x = ll
      if (rLeg.current) rLeg.current.rotation.x = rl
    }
    const burning = id === 'burning'
    for (let i = 0; i < flames.current.length; i++) {
      const f = flames.current[i]
      if (!f) continue
      f.visible = burning
      if (burning) {
        const tt = s.t + i * 1.7
        const k = 0.85 + Math.sin(tt * 14) * 0.18 + Math.sin(tt * 23 + i) * 0.08
        f.scale.set(k, k * (1 + Math.sin(tt * 9) * 0.25), k)
      }
    }
  })

  return (
    <group ref={outer}>
      <group position={[0, FEET_OFFSET, 0]}>
        <ZombieBody type={type} id="playground" seed={`pg${variant}`} leftArmRef={lArm} rightArmRef={rArm} leftLegRef={lLeg} rightLegRef={rLeg} />
        {FLAME_POS.map((p, i) => (
          <mesh key={i} ref={(el) => (flames.current[i] = el)} position={p} visible={false} geometry={flameGeo} material={flameMat} />
        ))}
      </group>
    </group>
  )
}

// ─── Weapons ─────────────────────────────────────────────────────────────────
// Default (un-skinned) look of the in-game gunMat factory.
const gunMat = (color, metalness = 0.7, roughness = 0.3) => (
  <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
)

export function WeaponDisplay({ weapon, ctrl }) {
  const grp = useRef(), pumpRef = useRef(), flame = useRef()
  const st = useRef({ n: -1, recoil: 0, pump: 0, t: 0 })
  useFrame((_, dt) => {
    const s = st.current
    const { id, n } = ctrl.current
    s.t += dt
    if (s.n !== n) {
      s.n = n
      if (id === 'fire') s.recoil = 1
      if (id === 'pump') s.pump = 1
    }
    if (s.recoil > 0) s.recoil = Math.max(0, s.recoil - dt * 8)
    if (s.pump > 0) {
      s.pump = Math.max(0, s.pump - dt / 0.42)
      if (pumpRef.current) pumpRef.current.position.z = -0.24 + Math.sin((1 - s.pump) * Math.PI) * 0.14
    }
    if (grp.current) {
      grp.current.rotation.x = s.recoil * 0.18
      grp.current.position.z = s.recoil * 0.04
    }
    if (flame.current) {
      const on = id === 'flame'
      flame.current.visible = on
      if (on) {
        const k = 1 + Math.sin(s.t * 40) * 0.2 + Math.sin(s.t * 23) * 0.15
        flame.current.scale.set(k, 1 + Math.sin(s.t * 31) * 0.2, k)
      }
    }
  })
  return (
    <group ref={grp}>
      {weapon === 'pistol' && <PistolModel gunMat={gunMat} />}
      {weapon === 'ak47' && <AKModel gunMat={gunMat} />}
      {weapon === 'deagle' && <DeagleModel gunMat={gunMat} />}
      {weapon === 'shotgun' && <ShotgunModel gunMat={gunMat} pumpRef={pumpRef} />}
      {weapon === 'flamethrower' && (
        <>
          <FlamethrowerModel gunMat={gunMat} />
          <mesh ref={flame} visible={false} position={[0, 0.03, -0.9]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.16, 0.5, 8]} />
            <meshBasicMaterial color="#ff6a10" transparent opacity={0.75} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

export function KnifeDisplay({ ctrl }) {
  const grp = useRef()
  const st = useRef({ n: -1, swing: 0 })
  useFrame((_, dt) => {
    const s = st.current
    const { id, n } = ctrl.current
    if (s.n !== n) { s.n = n; if (id === 'swing') s.swing = 1 }
    if (s.swing > 0) s.swing = Math.max(0, s.swing - dt / 0.35)
    if (!grp.current) return
    const arc = s.swing > 0 ? Math.sin((1 - s.swing) * Math.PI) : 0
    grp.current.rotation.set(arc * 0.2, arc * 0.25, -arc * 1.8)
    grp.current.position.x = -arc * 0.1
  })
  return <group ref={grp}><HuntingKnifeModel /></group>
}

// ─── Pickups ─────────────────────────────────────────────────────────────────
const NOOP = () => {}
const _pickupPos = { x: 0, y: 0, z: 0 }
export function AmmoCrateDisplay() {
  return <PickupMesh position={_pickupPos} onCollect={NOOP} />
}

// ─── Armour ──────────────────────────────────────────────────────────────────
// Armour is built inline in RemotePlayer, so we mount the real RemotePlayer and
// feed it two identical snapshots carrying the helmet / bodyArmor ids. The
// co-op store fields it reads (mpConnected, mpRole) are set while mounted and
// restored on unmount.
export function ArmourDisplay({ helmet = null, bodyArmor = null }) {
  useEffect(() => {
    const prev = useGameStore.getState()
    useGameStore.setState({ mpConnected: true, mpRole: 'host' })
    return () => useGameStore.setState({ mpConnected: prev.mpConnected, mpRole: prev.mpRole })
  }, [])
  useEffect(() => {
    const now = performance.now()
    const base = { x: 0, z: 0, yaw: 0, weapon: null, activeItem: null, helmet, bodyArmor }
    pushRemotePlayerSample({ ...base, t: now - 500 })
    pushRemotePlayerSample({ ...base, t: now })
  }, [helmet, bodyArmor])
  return <RemotePlayer />
}
