import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore, isSelfDowned } from '../store'
import { CROSSBOW, boltBlastDamage } from '../weaponRules'
import { lineOfSightBlocked } from '../walls'
import { getMap, getInitialMapId } from '../maps'
import { shake } from '../cameraFeel'
import { spawnImpact } from '../impactParticles'
import { spawnFlash } from '../specialFxPool'
import { playBoltPickup, playGrenadeBoom } from '../sounds'
import { send, isConnected } from '../net'
import { onGameEvent } from '../gameEvents'
import { Zombie, getZombiePositions } from './Zombie'

// Crossbow bolts: a fixed pool of always-mounted meshes (shared geometry + material), toggled
// via `visible`. Damage is resolved instantly in Player.jsx; this draws the bolt streaking to
// where it ends and then, per bolt:
//  - stick: stays in the wall / floor / corpse as a pick-up. Walk within PICKUP_RADIUS to
//    collect it (+1 crossbow reserve, store.collectBolt; left lying when the reserve is full or
//    no crossbow is carried). A bolt stuck in a corpse drops to the floor when the corpse clears.
//    The pool recycles the oldest bolt when full. Cleared at run start.
//  - wraith (upgraded): explodes on arrival (small blast), never a pick-up.
// Bolts are local to the shooter: nothing here is synced in co-op (only the blast's zombie
// hits go out as 'hit_zombie' events, like every other gun hit).
let BULLET_WALLS = getMap(getInitialMapId()).bulletWallSegments(useGameStore.getState?.().openDoors ?? {})
useGameStore.subscribe?.((s, prev) => {
  if (s.openDoors !== prev.openDoors) BULLET_WALLS = getMap(getInitialMapId()).bulletWallSegments(s.openDoors)
})

const POOL = CROSSBOW.MAX_BOLTS
const SPEED = 55          // m/s
const FLY = 1, STUCK = 2
const _geo = new THREE.BoxGeometry(0.045, 0.045, 0.6)
const _mat = new THREE.MeshBasicMaterial({ color: '#e8e0c0' })
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3(0, 0, 1)
const _pt = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

const _slots = Array.from({ length: POOL }, () => ({
  state: 0, seq: 0, t: 0, dur: 0, wraith: false, keep: false, attach: -1,
  from: new THREE.Vector3(), to: new THREE.Vector3(),
}))
let _seq = 0
let _meshes = null
let _camera = null

const hide = (i) => { _slots[i].state = 0; if (_meshes?.[i]) _meshes[i].visible = false }

export function clearBolts() {
  for (let i = 0; i < POOL; i++) hide(i)
}

// Free slot, else the oldest bolt.
function pickSlot() {
  let best = 0
  for (let i = 0; i < POOL; i++) {
    if (_slots[i].state === 0) return i
    if (_slots[i].seq < _slots[best].seq) best = i
  }
  return best
}

const netEvent = (event, data) => { if (isConnected()) send('game_event', { event, data }) }

// Wraith blast: small radius, light shake, pooled burst VFX at small scale.
function explode(x, y, z) {
  spawnFlash(x, y, z, 0.8)
  _pt.set(x, y, z)
  spawnImpact(_pt, _up, 'burst')
  playGrenadeBoom(x, y, z)
  if (_camera) shake(CROSSBOW.BLAST_SHAKE * Math.max(0, 1 - Math.hypot(_camera.position.x - x, _camera.position.z - z) / 8))
  const st = useGameStore.getState()
  const pos = getZombiePositions()
  let hits = 0, kills = 0
  for (const id in pos) {
    const zp = pos[id]
    const dx = zp.x - x, dz = zp.z - z
    const d = Math.hypot(dx, dz, 0.9 - y)
    const dmg = boltBlastDamage(d)
    if (dmg <= 0) continue
    if (lineOfSightBlocked(x, z, zp.x, zp.z, BULLET_WALLS)) continue
    const n = Number(id)
    const z0 = st.zombies.find((q) => q.id === n)
    if (!z0 || z0.dying) continue
    const killed = st.hitZombieBurst(n, dmg, 'bolt')
    netEvent('hit_zombie', { id: n, isHeadshot: false, source: 'bolt', mult: dmg })
    const dh = Math.hypot(dx, dz) || 1
    Zombie.hitReact(n, dx / dh, 0.25, dz / dh, false, 'shotgun', d)
    hits++
    if (killed) kills++
  }
  if (hits > 0) st.registerHit(kills > 0 ? 'kill' : 'hit')
}

export default function Bolts() {
  const refs = useRef([])
  const { camera } = useThree()
  _camera = camera

  // opts: { stick, wraith, attachId } — see Player.jsx
  Bolts.fire = (from, to, opts = {}) => {
    const i = pickSlot()
    const sl = _slots[i]
    const m = refs.current[i]
    if (!m) return
    sl.from.copy(from)
    sl.to.copy(to)
    _dir.subVectors(to, from)
    const len = _dir.length()
    sl.dur = Math.max(0.02, len / SPEED)
    sl.t = 0
    sl.seq = ++_seq
    sl.wraith = !!opts.wraith
    sl.attach = opts.attachId ?? -1
    sl.state = FLY
    sl.keep = !!opts.stick
    m.quaternion.setFromUnitVectors(_fwd, _dir.normalize())
    m.position.copy(from)
    m.visible = true
  }
  Bolts.clear = clearBolts

  // Bolts do not carry across runs
  useEffect(() => {
    _meshes = refs.current
    return onGameEvent((e) => { if (e.name === 'run_start' && !e.remote) clearBolts() })
  }, [])

  useFrame((_, dt) => {
    const st = useGameStore.getState()
    if (st.paused) return
    const canPick = st.phase === 'playing' && !isSelfDowned(st)
    const px = camera.position.x, pz = camera.position.z
    const r2 = CROSSBOW.PICKUP_RADIUS * CROSSBOW.PICKUP_RADIUS
    for (let i = 0; i < POOL; i++) {
      const sl = _slots[i]
      if (sl.state === 0) continue
      const m = refs.current[i]
      if (!m) continue
      if (sl.state === FLY) {
        sl.t += dt
        const k = Math.min(1, sl.t / sl.dur)
        m.position.lerpVectors(sl.from, sl.to, k)
        if (k < 1) continue
        // Arrived
        if (sl.wraith) { hide(i); explode(sl.to.x, sl.to.y, sl.to.z) }
        else if (sl.keep) sl.state = STUCK
        else hide(i)   // flew off into the open
        if (sl.state === STUCK && sl.attach === -2) { sl.attach = -1; dropToFloor(i, m) }   // ended in a living zombie
        continue
      }
      // STUCK: follow a corpse's lifetime, then wait to be collected
      if (sl.attach >= 0 && !st.zombies.some((z) => z.id === sl.attach)) { sl.attach = -1; dropToFloor(i, m) }
      if (!canPick) continue
      const dx = sl.to.x - px, dz = sl.to.z - pz
      if (dx * dx + dz * dz < r2 && st.collectBolt()) { hide(i); playBoltPickup() }
    }
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={_geo} material={_mat} visible={false} frustumCulled={false} />
      ))}
    </>
  )
}

// Lay the bolt on the floor where it was (corpse cleared / it ended in a living zombie).
function dropToFloor(i, m) {
  const sl = _slots[i]
  sl.to.y = 0.05
  _dir.subVectors(sl.to, sl.from)
  _dir.y = 0
  if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1)
  m.quaternion.setFromUnitVectors(_fwd, _dir.normalize())
  m.position.copy(sl.to)
}
