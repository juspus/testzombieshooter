import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { isSelfDowned } from '../store'   // W5: downed players can't throw
import { time } from '../timeScale'
import { getMap, getInitialMapId } from '../maps'
import { raycastWorld } from '../worldRay'
import { lineOfSightBlocked } from '../walls'
import { mobileInput } from '../mobileInput'
import { send, isConnected } from '../net'
import { shake, kick } from '../cameraFeel'
import { spawnImpact } from '../impactParticles'
import { spawnFlash, spawnScorch } from '../specialFxPool'
import {
  GRENADE, stepBody, throwVelocity, fuseLeft, cookedOut, tickInterval,
  grenadeZombieDamage, grenadePlayerDamage, grenadePlankHits, grenadeShake,
} from '../grenades'
import { playGrenadePin, playGrenadeTick, playGrenadeThrow, playGrenadeBounce, playGrenadeBoom } from '../sounds'
import { Zombie, getZombiePositions } from './Zombie'

// Wave 3 frag grenades. Hold G (or the mobile button) to cook, release to throw.
// Every client simulates every grenade (the thrower sends `grenade_throw` with origin /
// velocity / cook time) so both players see it fly and hurt only their OWN player; zombie
// and plank damage is applied by the host / solo player only (same model as the Exploder
// burst). Pure rules + ballistics are in grenades.js; this file is the pooled mesh, the
// input and the blast.

const ACTIVE_MAP = getMap(getInitialMapId())
const { WINDOW_DEFS, WIN_HALF, WIN_Y0, WIN_Y1 } = ACTIVE_MAP
const MAP_WALL_H = ACTIVE_MAP.WALL_H ?? 3.2

let BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(useGameStore.getState?.().openDoors ?? {})
useGameStore.subscribe?.((s, prev) => {
  if (s.openDoors !== prev.openDoors) BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(s.openDoors)
})

const POOL = 4   // max grenades in flight

// ── Pooled mesh: one InstancedMesh, one shared basic material ───────────────
const _d = new THREE.Object3D()
const _c = new THREE.Color()
const OLIVE = new THREE.Color('#4f5a2a')
const WARN = new THREE.Color('#ff3b1a')
const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), POOL)
mesh.frustumCulled = false
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
mesh.raycast = () => null
_d.scale.set(0, 0, 0); _d.updateMatrix()
for (let i = 0; i < POOL; i++) mesh.setMatrixAt(i, _d.matrix)
mesh.setColorAt(0, OLIVE)
mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)

// ── Pool state ───────────────────────────────────────────────────────────────
const slots = Array.from({ length: POOL }, () => ({ live: false, mine: false, fuse: 0, b: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rest: false, rolling: false, bounce: 0 } }))

const _up = { x: 0, y: 1, z: 0 }
const _pt = { x: 0, y: 0, z: 0 }
const _wr = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }
const _vel = { x: 0, y: 0, z: 0 }
const _dir = new THREE.Vector3()
let _planks = {}
let _camera = null

function rayFn(ox, oy, oz, dx, dy, dz, maxDist, out) {
  return raycastWorld(ox, oy, oz, dx, dy, dz, maxDist, BULLET_WALLS, MAP_WALL_H, WINDOW_DEFS, _planks, WIN_Y0, WIN_Y1, WIN_HALF, out)
}

const hide = (i) => { _d.scale.set(0, 0, 0); _d.updateMatrix(); mesh.setMatrixAt(i, _d.matrix); mesh.instanceMatrix.needsUpdate = true }

export function clearGrenades() {
  for (let i = 0; i < POOL; i++) { slots[i].live = false; hide(i) }
}

const freeSlot = () => slots.findIndex((s) => !s.live)

// Start a grenade. `cook` = seconds already burned off the fuse. Returns false when the pool is full.
function spawn(x, y, z, vx, vy, vz, cook, mine) {
  const i = freeSlot()
  if (i < 0) return false
  const s = slots[i]
  s.live = true; s.mine = mine; s.fuse = fuseLeft(cook)
  const b = s.b
  b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz
  b.rest = false; b.rolling = false; b.bounce = 0
  return true
}

// ── Detonation ───────────────────────────────────────────────────────────────
const netEvent = (event, data) => { if (isConnected()) send('game_event', { event, data }) }

function detonate(x, y, z, mine) {
  const vy = Math.max(0.35, y)
  spawnFlash(x, vy, z, 1.75)
  spawnFlash(x, vy + 0.4, z, 1.0)
  spawnScorch(x, z)
  _pt.x = x; _pt.y = vy; _pt.z = z
  spawnImpact(_pt, _up, 'burst')
  _pt.y = vy + 0.5
  spawnImpact(_pt, _up, 'burst')
  playGrenadeBoom(x, 1, z)

  const st = useGameStore.getState()
  // Self-damage (every client hurts only its own player; no friendly-fire immunity, like the exploder)
  if (_camera) {
    const cx = _camera.position.x, cz = _camera.position.z
    const dp = Math.hypot(cx - x, 1.1 - vy, cz - z)
    shake(grenadeShake(dp))
    const pd = grenadePlayerDamage(dp)
    if (pd > 0 && !lineOfSightBlocked(x, z, cx, cz, BULLET_WALLS)) st.hitPlayer(pd, x, z)
  }

  if (st.mpRole && st.mpRole !== 'host') return   // guests get zombie / plank results through the usual sync

  // Zombies (host / solo)
  let hits = 0, kills = 0
  const pos = getZombiePositions()
  for (const id in pos) {
    const zp = pos[id]
    const dx = zp.x - x, dz = zp.z - z
    const d = Math.hypot(dx, dz, 0.9 - vy)
    const dmg = grenadeZombieDamage(d)
    if (dmg <= 0) continue
    if (lineOfSightBlocked(x, z, zp.x, zp.z, BULLET_WALLS)) continue
    const n = Number(id)
    const z0 = useGameStore.getState().zombies.find((q) => q.id === n)
    if (!z0 || z0.dying) continue
    const killed = useGameStore.getState().hitZombieBurst(n, dmg)
    const dh = Math.hypot(dx, dz) || 1
    Zombie.hitReact(n, dx / dh, 0.25, dz / dh, false, 'shotgun', d)   // after the store update, so a kill gets the blast-back fall
    hits++
    if (killed) kills++
  }
  if (mine && hits > 0) useGameStore.getState().registerHit(kills > 0 ? 'kill' : 'hit')

  // Planks / glass (same rule as the exploder burst)
  const planks = useGameStore.getState().windowPlanks
  for (const w of WINDOW_DEFS) {
    const ph = grenadePlankHits(Math.hypot(w.winX - x, w.winZ - z))
    if (ph <= 0) continue
    useGameStore.getState().breakWindow(w.id)
    if ((planks[w.id] ?? 0) === 0) continue
    for (let i = 0; i < ph; i++) {
      useGameStore.getState().hitPlank(w.id)
      netEvent('hit_plank', { windowId: w.id })
    }
  }
}

// ── Cooking (input) ──────────────────────────────────────────────────────────
// Read by GrenadeHud through a rAF loop (no React state per frame).
export const cookState = { active: false, t: 0, nextTick: 0, armedHeld: false }
let _keyHeld = false

const canAct = (st) => st.phase === 'playing' && !st.shopOpen && !st.paused && !isSelfDowned(st)

// Release: spend a grenade and launch it from the camera. cook >= FUSE = it goes off in your hand.
function release(cam, cook) {
  const st = useGameStore.getState()
  if (!st.useGrenade()) return
  cam.getWorldDirection(_dir)
  const inHand = cookedOut(cook)
  if (inHand) { _vel.x = _vel.y = _vel.z = 0 }
  else throwVelocity(_dir.x, _dir.y, _dir.z, _vel)
  // Origin: slightly ahead of / below the eye, pulled back if a wall is in the way
  let reach = 0.5
  if (rayFn(cam.position.x, cam.position.y, cam.position.z, _dir.x, _dir.y, _dir.z, reach + GRENADE.RADIUS_BODY, _wr)) {
    reach = Math.max(0, _wr.dist - GRENADE.RADIUS_BODY - 0.05)
  }
  const ox = cam.position.x + _dir.x * reach
  const oy = cam.position.y - 0.18 + _dir.y * reach
  const oz = cam.position.z + _dir.z * reach
  spawn(ox, oy, oz, _vel.x, _vel.y, _vel.z, cook, true)
  if (!inHand) { playGrenadeThrow(); kick('pistol') }
  if (isConnected()) send('grenade_throw', { x: ox, y: oy, z: oz, vx: _vel.x, vy: _vel.y, vz: _vel.z, cook })
}

function Grenades() {
  const { camera } = useThree()
  _camera = camera

  useEffect(() => {
    const down = (e) => { if (e.code === 'KeyG' && !e.repeat) _keyHeld = true }
    const up = (e) => { if (e.code === 'KeyG') _keyHeld = false }
    const blur = () => { _keyHeld = false }
    document.addEventListener('keydown', down)
    document.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('keydown', down)
      document.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      _keyHeld = false
    }
  }, [])

  // Nothing carries across waves / runs
  useEffect(() => {
    if (!useGameStore.subscribe) return   // mocked store (tests)
    let prev = useGameStore.getState().phase
    return useGameStore.subscribe((s) => {
      if (s.phase === prev) return
      prev = s.phase
      if (s.phase === 'intermission' || s.phase === 'start') { clearGrenades(); cookState.active = false; useGameStore.getState().setGrenadeCooking(false) }
    })
  }, [])

  useFrame((_, delta) => {
    const st = useGameStore.getState()
    if (st.paused) return
    const dt = Math.min(delta, 0.05) * time.scale
    _planks = st.windowPlanks

    // Cook / throw
    const held = _keyHeld || mobileInput.grenadeHeld
    if (!cookState.active) {
      if (held && !cookState.armedHeld && canAct(st) && st.grenades > 0 && freeSlot() >= 0) {
        cookState.active = true; cookState.t = 0; cookState.nextTick = 0.3
        playGrenadePin()
        st.setGrenadeCooking(true)
      }
    } else if (!canAct(st) || st.grenades <= 0) {
      cookState.active = false; st.setGrenadeCooking(false)   // shop / pause / death: pin goes back in
    } else {
      cookState.t += dt   // same clamped game-time as the fuse, so slow frames never desync cook vs flight
      if (cookState.t >= cookState.nextTick) {
        playGrenadeTick(cookState.t / GRENADE.FUSE)
        cookState.nextTick = cookState.t + tickInterval(cookState.t)
      }
      if (!held || cookedOut(cookState.t)) {
        release(camera, cookState.t)
        cookState.active = false
        st.setGrenadeCooking(false)
      }
    }
    cookState.armedHeld = held   // a throw needs a fresh press (no auto re-cook while G stays down)

    // Flight / fuse
    let any = false
    for (let i = 0; i < POOL; i++) {
      const s = slots[i]
      if (!s.live) continue
      any = true
      const b = s.b
      s.fuse -= dt
      if (s.fuse <= 0) {
        s.live = false
        hide(i)
        detonate(b.x, b.y, b.z, s.mine)
        continue
      }
      stepBody(b, dt, rayFn)
      if (b.bounce > 1.5) { playGrenadeBounce(b.x, b.y, b.z, Math.min(1, b.bounce / 6)) }
      b.bounce = 0
      // blink faster/redder as the fuse burns down
      const warn = s.fuse < 1.2 ? (Math.sin(s.fuse * (14 + (1.2 - s.fuse) * 22)) > 0 ? 1 : 0) : 0
      _c.copy(OLIVE).lerp(WARN, warn)
      mesh.setColorAt(i, _c)
      _d.position.set(b.x, b.y, b.z); _d.scale.set(0.11, 0.14, 0.11); _d.rotation.set(0, 0, 0); _d.updateMatrix()
      mesh.setMatrixAt(i, _d.matrix)
    }
    if (any) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true }
  })

  return <primitive object={mesh} />
}

// Static API (like SpecialFX / ImpactFX): remote throws, debug hooks, tests.
Grenades.throw = ({ x, y, z, vx, vy, vz, cook = 0 }) => spawn(x, y, z, vx, vy, vz, cook, false)
Grenades.release = release
Grenades.clear = clearGrenades
// Dev/preview-only handle for browser tests (same gating as __game / ?wave=)
if (typeof window !== 'undefined' && import.meta.env.VITE_VERCEL_ENV !== 'production') window.__grenades = Grenades
export default Grenades
