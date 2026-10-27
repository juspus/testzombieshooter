import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { viewState } from '../viewState'
import { useGameStore } from '../store'
import Gun from './Gun'
import Knife from './Knife'
import BulletTrails from './BulletTrails'
import { zombieHitFx, fxNet } from '../hitFx'
import ShellCasings from './ShellCasings'
import FlameSpray from './FlameSpray'
import { Zombie } from './Zombie'
import { playGunshot, playEmptyClick, playReload, playZombieDie, playFootstep, playPumpAction, playShellThonk, playKnifeSwing, startFlamethrowerSound, stopFlamethrowerSound, setListenerPose } from '../sounds'
import { FLAME_DPS, FLAME_TICK_INTERVAL, FLAME_FUEL_PER_SEC, FLAME_RANGE, FLAME_CONE_COS, FLAME_BURN_DURATION, BODY_ARMOR_DEFS } from '../store'
import { collidesWithWalls, lineOfSightBlocked } from '../walls'
import { getMap, getInitialMapId } from '../maps'
import ImpactFX from './ImpactFX'
import { feel, kick, updateFeel, resetFeel } from '../cameraFeel'
import { raycastWorld, HIT_FLOOR, HIT_PLANK } from '../worldRay'

// Hit-marker kind for one trigger pull (see store.registerHit)
const markerKind = (killed, head) => (killed ? (head ? 'headkill' : 'kill') : (head ? 'head' : 'hit'))
const registerHit = (kind) => useGameStore.getState().registerHit(kind)

// Map is chosen once (debug ?map= param) and fixed for the whole session.
const ACTIVE_MAP = getMap(getInitialMapId())
const { WINDOW_DEFS, CHEST_POS, WIN_HALF, WIN_Y0, WIN_Y1 } = ACTIVE_MAP

// Static walls with window/door gaps already excluded — bullets pass through those openings.
// Uses bulletWallSegments() rather than wallSegments(): the collision system is
// height-blind (flat X/Z test), so any short cover meant to be shot over (e.g.
// the diner's counter) has to be excluded here even though it blocks movement.
// Wave 3: closed doors also stop bullets, so this list is rebuilt when a door opens.
let BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(useGameStore.getState?.().openDoors ?? {})
useGameStore.subscribe?.((s, prev) => {
  if (s.openDoors !== prev.openDoors) BULLET_WALLS = ACTIVE_MAP.bulletWallSegments(s.openDoors)
})
const DOOR_DEFS = ACTIVE_MAP.DOOR_DEFS ?? []
const DOOR_REACH_SQ = 2.4 * 2.4   // distance to a door's centre at which the buy prompt appears
const DOOR_HOLD = 0.7             // seconds to hold E / interact so a door is never bought by accident
const MAP_WALL_H = ACTIVE_MAP.WALL_H ?? 3.2

// Visual-only world raycast for bullet impacts (sparks / splinters). Writes the hit
// point into _worldHit and returns true when a wall/floor/plank is within maxDist.
// Does not affect gameplay hit detection.
const _wr = { dist: 0, nx: 0, ny: 0, nz: 0, kind: 0 }
const _worldHit = new THREE.Vector3()
const _worldNormal = new THREE.Vector3()
function worldImpact(ray, maxDist, windowPlanks, spawn = true, intensity = 1) {
  if (!raycastWorld(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z,
    maxDist, BULLET_WALLS, MAP_WALL_H, WINDOW_DEFS, windowPlanks, WIN_Y0, WIN_Y1, WIN_HALF, _wr)) return false
  _worldHit.copy(ray.direction).multiplyScalar(_wr.dist).add(ray.origin)
  if (spawn) {
    _worldNormal.set(_wr.nx, _wr.ny, _wr.nz)
    ImpactFX.spawn(_worldHit, _worldNormal, _wr.kind === HIT_PLANK ? 'plank' : _wr.kind === HIT_FLOOR ? 'floor' : 'wall', intensity)
  }
  return true
}

// Positional zombie death sound (falls back to flat audio if the zombie ref is gone).
function deathSound(refs, id) {
  const r = refs[id]
  if (r) playZombieDie(r.position.x, 1.2, r.position.z)
  else playZombieDie()
}

// Shatters a window's glass the first time a bullet passes through its opening.
// Analytic ray/plane test against each window's wall-plane and opening rect;
// a no-op on maps whose windows have no glass to break.
function checkWindowShatter(origin, direction, maxDist) {
  const broken = useGameStore.getState().brokenWindows
  for (const win of WINDOW_DEFS) {
    if (broken[win.id]) continue
    const isNS = win.wall === 'N' || win.wall === 'S'
    const denom = isNS ? direction.z : direction.x
    if (Math.abs(denom) < 1e-6) continue
    const t = ((isNS ? win.winZ : win.winX) - (isNS ? origin.z : origin.x)) / denom
    if (t <= 0 || t > maxDist) continue
    const py = origin.y + direction.y * t
    if (py < WIN_Y0 || py > WIN_Y1) continue
    const cross = isNS ? origin.x + direction.x * t : origin.z + direction.z * t
    const center = isNS ? win.winX : win.winZ
    if (Math.abs(cross - center) > WIN_HALF) continue
    useGameStore.getState().breakWindow(win.id)
  }
}
import { send, isConnected } from '../net'
import { mobileInput, mobileState, consumeMobileLook, consumeMobilePressed } from '../mobileInput'
import * as THREE from 'three'
import { playDoorDenied } from '../sounds'
import { doorBuyStatus } from '../doors'
import * as WR from '../weaponRules'
import { updateMachines } from '../machineInput'
import Bolts from './Bolts'

function netSend(event, data) {
  if (isConnected()) send('game_event', { event, data })
}

const _flameForward = new THREE.Vector3()
const _knifePoint = new THREE.Vector3()
const _knifeDir = new THREE.Vector3()
const _flameToZombie = new THREE.Vector3()
const _flameZombiePos = new THREE.Vector3()

const CHEST_RADIUS_SQ = 1.5 * 1.5
const BASE_KNIFE_COOLDOWN = 0.4
const BASE_KNIFE_RANGE = 2.2
const SKIP_TIME = 0.6

const reloadTimeForPerks = (perks, weapon) => (weapon === 'crossbow' ? 2.2 : 1.5) - (perks.fast_hands ? (weapon === 'crossbow' ? 0.7 : 0.5) : 0)
const boardTimeForPerks = (perks) => perks.carpenter ? 1.3 : 2.0
const moveSpeedForPerks = (perks, bodyArmor) => MOVE_SPEED * (perks.runners_breath ? 1.15 : 1) * (BODY_ARMOR_DEFS[bodyArmor]?.speedMultiplier ?? 1)
const knifeCooldownForPerks = (perks) => perks.knife_mastery ? 0.25 : BASE_KNIFE_COOLDOWN
const knifeRangeForPerks = (perks) => perks.knife_mastery ? 2.8 : BASE_KNIFE_RANGE

function isIronSightsHeadshot(zombieRef, point, perks) {
  if (!perks.iron_sights || !zombieRef || !point) return false
  const local = zombieRef.worldToLocal(point.clone())
  return local.y > 0.55 && Math.abs(local.x) < 0.34 && Math.abs(local.z) < 0.34
}

const PLAYER_HEIGHT = 1.7
const MOVE_SPEED = 8
const LOOK_SENSITIVITY = 0.002
const MOBILE_LOOK_SENSITIVITY = 0.007
const ARENA_BOUND = 18.5
const STEP_INTERVAL = 0.42

// Module-level reusables for mobile auto-shoot detection (no per-frame allocation)
const _autoPos = new THREE.Vector3()
const _autoFwd = new THREE.Vector3()
const _autoDir = new THREE.Vector3()
const _autoNearRefs = new Array(25)  // at most 25 active zombies

export default function Player() {
  const { camera, gl } = useThree()
  const hitZombie = useGameStore((s) => s.hitZombie)
  const hitZombieFlame = useGameStore((s) => s.hitZombieFlame)
  const consumeFuel = useGameStore((s) => s.consumeFuel)
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const activeItem = useGameStore((s) => s.activeItem)
  const perks = useGameStore((s) => s.perks)
  const bodyArmor = useGameStore((s) => s.bodyArmor)
  const toggleItem = useGameStore((s) => s.toggleItem)
  const setKnifeCooldown = useGameStore((s) => s.setKnifeCooldown)
  const consumeBullet = useGameStore((s) => s.consumeBullet)
  const beginReload = useGameStore((s) => s.beginReload)
  const finishReload = useGameStore((s) => s.finishReload)
  const addPlank = useGameStore((s) => s.addPlank)
  const upgradePlanks = useGameStore((s) => s.upgradePlanks)
  const skipIntermission = useGameStore((s) => s.skipIntermission)
  const setNearWindowId = useGameStore((s) => s.setNearWindowId)
  const setBoardingProgress = useGameStore((s) => s.setBoardingProgress)
  const setSkipProgress = useGameStore((s) => s.setSkipProgress)
  const openShop = useGameStore((s) => s.openShop)
  const closeShop = useGameStore((s) => s.closeShop)
  const setNearChest = useGameStore((s) => s.setNearChest)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const windowPlankStrong = useGameStore((s) => s.windowPlankStrong)
  const strongPlanksMode = useGameStore((s) => s.strongPlanksMode)
  const walls = useGameStore((s) => s.walls)
  const wallsRef = useRef(walls)
  const windowPlanksRef = useRef(windowPlanks)
  const windowPlankStrongRef = useRef(windowPlankStrong)
  const strongPlanksModeRef = useRef(strongPlanksMode)
  const prevNearWindowRef = useRef(-1)
  const boardTimerRef = useRef(0)
  const boardingWindowRef = useRef(-1)
  const doorHoldRef = useRef(0)       // Wave 3 doors: hold timer / id / deny latch / request cooldown
  const doorHoldIdRef = useRef(null)
  const doorDeniedRef = useRef(false)
  const doorCooldownRef = useRef(0)
  const skipTimerRef = useRef(0)
  const paused = useGameStore((s) => s.paused)
  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const shopOpenRef = useRef(false)
  const nearChestRef = useRef(false)
  const mouseHeldRef = useRef(false)
  const akFireTimerRef = useRef(0)
  const shotgunCooldownRef = useRef(0)
  const knifeCooldownRef = useRef(0)
  const autoShootCooldownRef = useRef(0)
  const autoDetectRC = useRef(null)
  if (!autoDetectRC.current) { autoDetectRC.current = new THREE.Raycaster(); autoDetectRC.current.far = 30 }
  const flameTickTimerRef = useRef(0)
  const flameSoundActiveRef = useRef(false)
  const burningZombiesRef = useRef(new Map())
  const weapon = useGameStore((s) => s.weapon)
  const ownedWeapons = useGameStore((s) => s.ownedWeapons)
  const switchWeapon = useGameStore((s) => s.switchWeapon)
  const weaponRef = useRef(weapon)
  const ownedWeaponsRef = useRef(ownedWeapons)
  const activeItemRef = useRef(activeItem)
  const perksRef = useRef(perks)
  const bodyArmorRef = useRef(bodyArmor)

  const yaw = useRef(0)
  const pitch = useRef(0)
  const keys = useRef({})
  const locked = useRef(false)
  const zombieRefs = useRef({})
  const reloadTimer = useRef(0)
  const stepTimer = useRef(0)
  const prevYaw = useRef(0)
  const prevPitch = useRef(0)
  Player.registerZombieRef = (id, ref) => { zombieRefs.current[id] = ref }
  Player.unregisterZombieRef = (id) => { delete zombieRefs.current[id] }

  useEffect(() => { wallsRef.current = walls }, [walls])
  useEffect(() => { windowPlanksRef.current = windowPlanks }, [windowPlanks])
  useEffect(() => { windowPlankStrongRef.current = windowPlankStrong }, [windowPlankStrong])
  useEffect(() => { strongPlanksModeRef.current = strongPlanksMode }, [strongPlanksMode])
  useEffect(() => { weaponRef.current = weapon }, [weapon])
  useEffect(() => { mobileInput.autoShootHeld = false; autoShootCooldownRef.current = 0 }, [weapon])
  useEffect(() => { ownedWeaponsRef.current = ownedWeapons }, [ownedWeapons])
  useEffect(() => { activeItemRef.current = activeItem }, [activeItem])
  useEffect(() => { perksRef.current = perks }, [perks])
  useEffect(() => { bodyArmorRef.current = bodyArmor }, [bodyArmor])

  // Cancel any in-progress reload when the player switches weapons
  useEffect(() => { reloadTimer.current = 0 }, [weapon])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  // Dev/preview-only handle for browser tests (same gating as the ?wave= debug params)
  useEffect(() => {
    if (import.meta.env.VITE_VERCEL_ENV === 'production') return
    window.__dbg = { camera, feel, store: useGameStore, yaw, pitch, keys }
  }, [camera])

  // Give FlameSpray access to zombie refs and a damage callback for per-particle hits.
  // zombieRefs.current is the live mutable map so it stays current without re-running.
  useEffect(() => {
    FlameSpray.zombieRefs = zombieRefs.current
    FlameSpray.onZombieHit = (zid, baseDamage) => {
      const damage = baseDamage * WR.damageMult('flamethrower', !!useGameStore.getState().upgradedWeapons.flamethrower)
      const flameKill = useGameStore.getState().hitZombieFlame(zid, damage)
      if (flameKill) deathSound(zombieRefs.current, zid)
      registerHit(flameKill ? 'kill' : 'burn')
      Zombie.ignite(zid)
      netSend('hit_zombie_flame', { id: zid, damage })
    }
    return () => {
      FlameSpray.zombieRefs = null
      FlameSpray.onZombieHit = null
    }
  }, [])

  // Reset position + look direction only when starting a fresh game (wave 1)
  useEffect(() => {
    if (phase === 'intermission' && wave === 1) {
      camera.position.set(0, PLAYER_HEIGHT, 0)
      yaw.current = 0
      pitch.current = 0
      resetFeel()
    }
  }, [phase, wave, camera])

  // Sync shopOpen ref and manage pointer lock
  useEffect(() => {
    shopOpenRef.current = shopOpen
    if (shopOpen) document.exitPointerLock?.()
  }, [shopOpen])

  // Force-stop the flamethrower spray when the shop opens, the weapon is switched
  // away, or gameplay pauses — the per-frame block above only runs during active play.
  useEffect(() => {
    if (shopOpen || phase !== 'playing' || weapon !== 'flamethrower' || activeItem !== 'gun') {
      mouseHeldRef.current = false
      Gun.setFlameActive?.(false)
      if (flameSoundActiveRef.current) {
        flameSoundActiveRef.current = false
        stopFlamethrowerSound()
        flameTickTimerRef.current = 0
      }
    }
  }, [shopOpen, phase, weapon, activeItem])

  // Make sure the flamethrower sound never keeps playing after unmount
  useEffect(() => () => {
    if (flameSoundActiveRef.current) {
      flameSoundActiveRef.current = false
      stopFlamethrowerSound()
    }
  }, [])

  const requestLock = useCallback(() => {
    if ((phase === 'playing' || phase === 'intermission') && !shopOpenRef.current) {
      gl.domElement.requestPointerLock()
    }
  }, [phase, gl])

  useEffect(() => {
    const onLockChange = () => {
      locked.current = document.pointerLockElement === gl.domElement
    }
    const onMouseMove = (e) => {
      if (!locked.current || pausedRef.current) return
      yaw.current -= e.movementX * LOOK_SENSITIVITY
      pitch.current -= e.movementY * LOOK_SENSITIVITY
      pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch.current))
    }
    const onKeyDown = (e) => {
      keys.current[e.code] = true
      if (e.code === 'Escape' && shopOpenRef.current) { closeShop(); return }
      if (e.code === 'KeyE') {
        if (shopOpenRef.current) { closeShop(); return }
        if (nearChestRef.current) { openShop(); return }
      }
      if (e.code === 'KeyQ' && !shopOpenRef.current) {
        toggleItem()
        return
      }
      if (e.code === 'KeyR' && !shopOpenRef.current && activeItemRef.current === 'gun' && beginReload()) {
        reloadTimer.current = reloadTimeForPerks(perksRef.current, weaponRef.current)
        playReload()
      }
    }
    const onKeyUp = (e) => { keys.current[e.code] = false }

    const onWheel = (e) => {
      if (shopOpenRef.current || pausedRef.current) return
      if (!locked.current) return
      const weapons = ownedWeaponsRef.current
      if (weapons.length <= 1) return
      const idx = weapons.indexOf(weaponRef.current)
      const dir = e.deltaY > 0 ? 1 : -1
      const next = (idx + dir + weapons.length) % weapons.length
      switchWeapon(weapons[next])
    }

    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('wheel', onWheel)
    }
  }, [gl, switchWeapon])

  const shoot = useCallback(() => {
    if (pausedRef.current) return
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    if (weaponRef.current === 'shotgun' && shotgunCooldownRef.current > 0) return

    if (useGameStore.getState().benchBusy) return   // gun is inside the Upgrade Bench
    if (!consumeBullet()) { playEmptyClick(); return }

    const wpn = weaponRef.current
    const upg = !!useGameStore.getState().upgradedWeapons[wpn]
    const dmgMult = WR.damageMult(wpn, upg)   // upgraded x2, crossbow bolt one-shots

    const muzzle = Gun.getMuzzlePosition?.() ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 0.5)
    Gun.fire?.()
    kick(weaponRef.current)
    playGunshot(weaponRef.current, upg)
    if (weaponRef.current === 'shotgun') navigator.vibrate?.([30, 20, 30])
    else if (weaponRef.current !== 'flamethrower') navigator.vibrate?.(18)
    if (isConnected()) send('remote_sound', {
      sound: 'gunshot',
      weapon: weaponRef.current,
      up: upg,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    })

    if (weaponRef.current === 'shotgun') {
      shotgunCooldownRef.current = 0.5

      // Pump animation + sounds
      Gun.pump?.()
      setTimeout(playPumpAction, 40)
      setTimeout(playShellThonk, 140)  // 0.1s after pump starts

      // Eject shell casing — spawn ahead and right of camera so it's visible
      const right = new THREE.Vector3(
        camera.matrixWorld.elements[0],
        camera.matrixWorld.elements[1],
        camera.matrixWorld.elements[2],
      )
      const fwd = new THREE.Vector3(
        -camera.matrixWorld.elements[8],
        -camera.matrixWorld.elements[9],
        -camera.matrixWorld.elements[10],
      )
      const ejectPos = camera.position.clone()
        .addScaledVector(fwd, 0.45)
        .addScaledVector(right, 0.28)
        .add(new THREE.Vector3(0, -0.10, 0))
      ShellCasings.eject?.(ejectPos, right)

      // 12 pellets spread in a cone — each raycasted independently
      const PELLETS = 12
      const SPREAD = 0.10  // NDC half-width of cone
      const killed = new Set()
      let anyHit = false, anyHead = false, anyKill = false
      for (let i = 0; i < PELLETS; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * SPREAD  // sqrt for even circular distribution
        const pelletRC = new THREE.Raycaster()
        pelletRC.setFromCamera({ x: Math.cos(angle) * r, y: Math.sin(angle) * r }, camera)
        checkWindowShatter(pelletRC.ray.origin, pelletRC.ray.direction, 30)
        let bestId = null, bestDist = Infinity, bestPoint = null, bestHead = false
        for (const [id, ref] of Object.entries(zombieRefs.current)) {
          if (!ref) continue
          const hits = pelletRC.intersectObject(ref, true)
          if (hits.length > 0 && hits[0].distance < bestDist &&
              !lineOfSightBlocked(camera.position.x, camera.position.z, hits[0].point.x, hits[0].point.z, BULLET_WALLS)) {
            bestDist = hits[0].distance
            bestId = Number(id)
            bestPoint = hits[0].point.clone()
            bestHead = hits[0].object.userData.isHead === true
          }
        }
        let trailEnd = bestPoint
        if (!trailEnd) {
          if (worldImpact(pelletRC.ray, 30, windowPlanksRef.current, true, 0.35)) trailEnd = _worldHit.clone()
          else trailEnd = camera.position.clone().addScaledVector(pelletRC.ray.direction, 30)
        }
        BulletTrails.add(muzzle, trailEnd)
        if (bestId !== null) {
          if (!bestHead) bestHead = isIronSightsHeadshot(zombieRefs.current[bestId], bestPoint, perksRef.current)
          const died = hitZombie(bestId, bestHead, 'gun', dmgMult)
          anyHit = true
          if (bestHead) anyHead = true
          if (died && !killed.has(bestId)) { killed.add(bestId); anyKill = true; deathSound(zombieRefs.current, bestId) }
          zombieHitFx(bestId, bestPoint, pelletRC.ray.direction, bestHead, 'shotgun', bestDist)
          netSend('hit_zombie', { id: bestId, isHeadshot: bestHead, source: 'gun', mult: dmgMult, ...fxNet(bestPoint, pelletRC.ray.direction, bestDist, 'shotgun') })
        }
      }
      // One marker per trigger pull, not per pellet
      if (anyHit) registerHit(markerKind(anyKill, anyHead))
    } else if (weaponRef.current === 'crossbow') {
      // Silent bolt: instant-kill, pierces 1 (two zombies in line). Damage resolves now;
      // Bolts.jsx draws the bolt streaking to where it ends.
      checkWindowShatter(raycaster.ray.origin, raycaster.ray.direction, 50)
      const hits = []
      for (const [id, ref] of Object.entries(zombieRefs.current)) {
        if (!ref) continue
        const intersects = raycaster.intersectObject(ref, true)
        if (intersects.length > 0) hits.push({ id: Number(id), dist: intersects[0].distance, point: intersects[0].point.clone(), head: intersects[0].object.userData.isHead === true })
      }
      hits.sort((a, b) => a.dist - b.dist)
      const targets = []
      for (const hit of hits) {
        if (lineOfSightBlocked(camera.position.x, camera.position.z, hit.point.x, hit.point.z, BULLET_WALLS)) break
        targets.push(hit)
        if (targets.length >= 2) break
      }
      let boltEnd = targets.length > 0 ? targets[targets.length - 1].point : null
      if (targets.length < 2 && worldImpact(raycaster.ray, 50, windowPlanksRef.current, true, 0.5)) {
        if (!boltEnd || _wr.dist > boltEnd.distanceTo(raycaster.ray.origin)) boltEnd = _worldHit.clone()
      }
      if (!boltEnd) boltEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
      Bolts.fire?.(muzzle, boltEnd)
      let anyKill = false, anyHead = false
      for (const t of targets) {
        if (hitZombie(t.id, t.head, 'gun', dmgMult)) { anyKill = true; deathSound(zombieRefs.current, t.id) }
        if (t.head) anyHead = true
        zombieHitFx(t.id, t.point, raycaster.ray.direction, t.head, 'crossbow', t.dist)
        netSend('hit_zombie', { id: t.id, isHeadshot: t.head, source: 'gun', mult: dmgMult, ...fxNet(t.point, raycaster.ray.direction, t.dist, 'crossbow') })
      }
      if (targets.length > 0) registerHit(markerKind(anyKill, anyHead))
    } else if (weaponRef.current === 'deagle') {
      // Pierce up to 3 enemies, instant kill each
      checkWindowShatter(raycaster.ray.origin, raycaster.ray.direction, 50)
      const hits = []
      for (const [id, ref] of Object.entries(zombieRefs.current)) {
        if (!ref) continue
        const intersects = raycaster.intersectObject(ref, true)
        if (intersects.length > 0) hits.push({ id: Number(id), dist: intersects[0].distance, point: intersects[0].point.clone() })
      }
      hits.sort((a, b) => a.dist - b.dist)
      const targets = []
      for (const hit of hits) {
        if (lineOfSightBlocked(camera.position.x, camera.position.z, hit.point.x, hit.point.z, BULLET_WALLS)) break
        targets.push(hit)
        if (targets.length >= 3) break
      }
      let trailEnd = targets.length > 0 ? targets[targets.length - 1].point : null
      if (targets.length < 3 && worldImpact(raycaster.ray, 50, windowPlanksRef.current)) {
        // Round passes through every zombie hit and ends on the world surface behind them
        if (!trailEnd || _wr.dist > trailEnd.distanceTo(raycaster.ray.origin)) trailEnd = _worldHit.clone()
      }
      if (!trailEnd) trailEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
      BulletTrails.add(muzzle, trailEnd)
      let deagleKill = false
      for (const target of targets) {
        if (hitZombie(target.id, true, 'gun', dmgMult)) { deagleKill = true; deathSound(zombieRefs.current, target.id) }
        zombieHitFx(target.id, target.point, raycaster.ray.direction, true, 'deagle', target.dist)
        netSend('hit_zombie', { id: target.id, isHeadshot: true, source: 'gun', mult: dmgMult, ...fxNet(target.point, raycaster.ray.direction, target.dist, 'deagle') })
      }
      if (targets.length > 0) registerHit(markerKind(deagleKill, true))
    } else {
      // Single target
      checkWindowShatter(raycaster.ray.origin, raycaster.ray.direction, 50)
      let closest = null, closestDist = Infinity, hitPoint = null, isHeadshot = false, hitFaceNormal = null
      for (const [id, ref] of Object.entries(zombieRefs.current)) {
        if (!ref) continue
        const intersects = raycaster.intersectObject(ref, true)
        if (intersects.length > 0 && intersects[0].distance < closestDist &&
            !lineOfSightBlocked(camera.position.x, camera.position.z, intersects[0].point.x, intersects[0].point.z, BULLET_WALLS)) {
          closestDist = intersects[0].distance
          closest = id
          hitPoint = intersects[0].point.clone()
          isHeadshot = intersects[0].object.userData.isHead === true
          hitFaceNormal = intersects[0].face?.normal.clone() ?? new THREE.Vector3(0, 0, 1)
        }
      }

      // Mobile aim assist: if center ray missed, try a small forgiveness cone
      if (closest === null && mobileState.active) {
        const AIM_OFFSETS = [
          { x: 0.04, y: 0 }, { x: -0.04, y: 0 },
          { x: 0, y: 0.04 }, { x: 0, y: -0.04 },
          { x: 0.03, y: 0.03 }, { x: -0.03, y: 0.03 },
        ]
        for (const offset of AIM_OFFSETS) {
          if (closest !== null) break
          const assistRC = new THREE.Raycaster()
          assistRC.setFromCamera(offset, camera)
          for (const [id, ref] of Object.entries(zombieRefs.current)) {
            if (!ref) continue
            const intersects = assistRC.intersectObject(ref, true)
            if (intersects.length > 0 && intersects[0].distance < closestDist &&
                !lineOfSightBlocked(camera.position.x, camera.position.z, intersects[0].point.x, intersects[0].point.z, BULLET_WALLS)) {
              closestDist = intersects[0].distance
              closest = id
              hitPoint = intersects[0].point.clone()
              isHeadshot = intersects[0].object.userData.isHead === true
              hitFaceNormal = intersects[0].face?.normal.clone() ?? new THREE.Vector3(0, 0, 1)
            }
          }
        }
      }

      let trailEnd = hitPoint
      if (!trailEnd) {
        if (worldImpact(raycaster.ray, 50, windowPlanksRef.current)) trailEnd = _worldHit.clone()
        else trailEnd = camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
      }
      BulletTrails.add(muzzle, trailEnd)
      if (closest !== null) {
        const id = Number(closest)
        const zombieRef = zombieRefs.current[closest]
        if (!isHeadshot && hitPoint && zombieRef) {
          isHeadshot = isIronSightsHeadshot(zombieRef, hitPoint, perksRef.current)
        }
        if (!isHeadshot && hitPoint && zombieRef && hitFaceNormal) {
          const localPos = zombieRef.worldToLocal(hitPoint.clone())
          localPos.addScaledVector(hitFaceNormal, 0.012)
          Zombie.addBulletHole(id, localPos, hitFaceNormal)
        }
        const singleKill = hitZombie(id, isHeadshot, 'gun', dmgMult)
        if (singleKill) deathSound(zombieRefs.current, id)
        registerHit(markerKind(singleKill, isHeadshot))
        if (hitPoint) zombieHitFx(id, hitPoint, raycaster.ray.direction, isHeadshot, weaponRef.current, closestDist)
        netSend('hit_zombie', { id, isHeadshot, source: 'gun', mult: dmgMult, ...(hitPoint ? fxNet(hitPoint, raycaster.ray.direction, closestDist, weaponRef.current) : {}) })
      }
    }
  }, [camera, hitZombie, consumeBullet])

  const knifeSwing = useCallback(() => {
    if (knifeCooldownRef.current > 0) return

    Knife.swing?.()
    playKnifeSwing()
    if (isConnected()) send('remote_sound', {
      sound: 'knife',
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    })
    const cooldown = knifeCooldownForPerks(perksRef.current)
    knifeCooldownRef.current = cooldown
    setKnifeCooldown(cooldown)

    // Melee hit: closest zombie within range and roughly in front of player
    const camPos = camera.position
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const zombiePos = new THREE.Vector3()
    let closestId = null, closestDist = Infinity

    for (const [id, ref] of Object.entries(zombieRefs.current)) {
      if (!ref) continue
      ref.getWorldPosition(zombiePos)
      zombiePos.y = camPos.y  // ignore height difference for range check
      const dist = camPos.distanceTo(zombiePos)
      if (dist > knifeRangeForPerks(perksRef.current)) continue
      const toZombie = zombiePos.clone().sub(camPos).normalize()
      if (fwd.dot(toZombie) < 0.1) continue  // must be in roughly forward 160° arc
      if (dist < closestDist) { closestDist = dist; closestId = id }
    }

    if (closestId !== null) {
      const kid = Number(closestId)
      const knifeKill = hitZombie(kid, true, 'knife')
      if (knifeKill) deathSound(zombieRefs.current, kid)
      registerHit(markerKind(knifeKill, false))
      const kref = zombieRefs.current[closestId]
      if (kref) {
        kref.getWorldPosition(_knifePoint)
        zombieHitFx(kid, _knifePoint, _knifeDir.copy(fwd), true, 'knife', closestDist)
      }
      netSend('hit_zombie', { id: kid, isHeadshot: true, source: 'knife', ...(kref ? fxNet(_knifePoint, fwd, closestDist, 'knife') : {}) })
    }
  }, [camera, hitZombie, setKnifeCooldown])

  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.button !== 0) return
      if (shopOpenRef.current) return
      if (!locked.current) { requestLock(); return }
      if (phase !== 'playing') return
      if (activeItemRef.current === 'knife') {
        knifeSwing()
        return
      }
      if (weaponRef.current === 'flamethrower') {
        mouseHeldRef.current = true
        return
      }
      shoot()
      mouseHeldRef.current = true
      akFireTimerRef.current = 0.1  // next AK shot in 0.1s
    }
    const onMouseUp = (e) => {
      if (e.button !== 0) return
      mouseHeldRef.current = false
    }
    gl.domElement.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      gl.domElement.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [gl, phase, requestLock, shoot, knifeSwing])

  useFrame((_, delta) => {
    if (phase !== 'playing' && phase !== 'intermission') return

    const mobilePressed = consumeMobilePressed()
    const mobileLook = consumeMobileLook()

    if (mobilePressed.interact) {
      if (shopOpenRef.current) {
        closeShop()
        shopOpenRef.current = false
      } else if (nearChestRef.current) {
        openShop()
        shopOpenRef.current = true
      }
    }

    if (mobilePressed.swap && !shopOpenRef.current) {
      toggleItem()
    }

    // Mobile has no scroll wheel: the ⇄ button cycles through the carried guns.
    if (mobilePressed.cycle && !shopOpenRef.current) {
      const weapons = ownedWeaponsRef.current
      if (weapons.length > 1) {
        switchWeapon(weapons[(weapons.indexOf(weaponRef.current) + 1) % weapons.length])
        if (activeItemRef.current === 'knife') toggleItem()
      }
    }

    if (mobilePressed.reload && !shopOpenRef.current && activeItemRef.current === 'gun' && beginReload()) {
      reloadTimer.current = reloadTimeForPerks(perksRef.current, weaponRef.current)
      playReload()
    }

    if (shopOpenRef.current || pausedRef.current) return

    if (mobileLook.x !== 0 || mobileLook.y !== 0) {
      yaw.current -= mobileLook.x * MOBILE_LOOK_SENSITIVITY
      pitch.current -= mobileLook.y * MOBILE_LOOK_SENSITIVITY
      pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch.current))
    }

    if (mobilePressed.shoot && phase === 'playing') {
      if (activeItemRef.current === 'knife') {
        knifeSwing()
      } else {
        shoot()
        akFireTimerRef.current = 0.1
        autoShootCooldownRef.current = 0.4
      }
    }

    // Mobile auto-shoot: fires when a zombie is in the crosshair
    if (mobileState.active && phase === 'playing' && activeItemRef.current === 'gun') {
      autoShootCooldownRef.current -= delta
      const isFlamethrower = weaponRef.current === 'flamethrower'
      const hasAmmo = isFlamethrower
        ? useGameStore.getState().reserveBullets > 0
        : useGameStore.getState().bulletsInClip > 0 && reloadTimer.current <= 0
      let hasTarget = false
      if (hasAmmo) {
        // Pre-filter: only test zombies in front and within range
        const camPos = camera.position
        const rangeSq = isFlamethrower ? FLAME_RANGE * FLAME_RANGE : 625
        _autoFwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
        let nearCount = 0
        for (const ref of Object.values(zombieRefs.current)) {
          if (!ref) continue
          _autoPos.setFromMatrixPosition(ref.matrixWorld)
          const dx = _autoPos.x - camPos.x, dz = _autoPos.z - camPos.z
          if (dx * dx + dz * dz > rangeSq) continue
          _autoDir.set(dx, 0, dz).normalize()
          if (_autoFwd.dot(_autoDir) < 0.1) continue
          _autoNearRefs[nearCount++] = ref
        }
        if (nearCount > 0) {
          const OFFSETS = [
            { x: 0, y: 0 }, { x: 0.04, y: 0 }, { x: -0.04, y: 0 },
            { x: 0, y: 0.04 }, { x: 0, y: -0.04 },
          ]
          outer: for (const off of OFFSETS) {
            autoDetectRC.current.setFromCamera(off, camera)
            for (let i = 0; i < nearCount; i++) {
              const hit = autoDetectRC.current.intersectObject(_autoNearRefs[i], true)[0]
              if (!hit) continue
              // Don't auto-shoot through walls — require a clear line of sight.
              if (lineOfSightBlocked(camPos.x, camPos.z, hit.point.x, hit.point.z, BULLET_WALLS)) continue
              hasTarget = true
              break outer
            }
          }
        }
      }
      if (hasTarget) {
        if (weaponRef.current === 'ak47' || isFlamethrower) {
          mobileInput.autoShootHeld = true
        } else if (autoShootCooldownRef.current <= 0) {
          shoot()
          autoShootCooldownRef.current = weaponRef.current === 'shotgun' ? 0.6 : 0.4
        }
      } else {
        mobileInput.autoShootHeld = false
      }
    } else if (mobileInput.autoShootHeld) {
      mobileInput.autoShootHeld = false
    }

    // Chest proximity
    {
      const px = camera.position.x, pz = camera.position.z
      const cdx = px - CHEST_POS.x, cdz = pz - CHEST_POS.z
      const near = cdx * cdx + cdz * cdz < CHEST_RADIUS_SQ
      if (near !== nearChestRef.current) {
        nearChestRef.current = near
        setNearChest(near)
      }
    }

    // Shotgun pump cooldown
    if (shotgunCooldownRef.current > 0) shotgunCooldownRef.current = Math.max(0, shotgunCooldownRef.current - delta)

    // Knife cooldown (tick + sync to store for HUD)
    if (knifeCooldownRef.current > 0) {
      knifeCooldownRef.current = Math.max(0, knifeCooldownRef.current - delta)
      setKnifeCooldown(knifeCooldownRef.current)
    }

    // Reload countdown
    if (reloadTimer.current > 0) {
      reloadTimer.current -= delta
      if (reloadTimer.current <= 0) {
        reloadTimer.current = 0
        finishReload()
      }
    }

    // Update nearest window for HUD prompt (only set store when value changes)
    {
      const px = camera.position.x, pz = camera.position.z
      let nearId = -1, nearDist = 2.5
      for (const win of WINDOW_DEFS) {
        const dx = px - win.ix, dz = pz - win.iz
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d < nearDist) { nearDist = d; nearId = win.id }
      }
      if (nearId !== prevNearWindowRef.current) {
        prevNearWindowRef.current = nearId
        setNearWindowId(nearId)
      }
    }

    // Wave 3 Mystery Box / Upgrade Bench: hold-E interaction + bench timer.
    {
      const eHeldM = keys.current['KeyE'] || mobileInput.interactHeld
      useGameStore.getState().tickBench(delta)
      updateMachines(delta, camera.position.x, camera.position.z, eHeldM, shopOpenRef.current || nearChestRef.current)
    }

    // Wave 3 buyable doors: nearest closed door -> HUD prompt, hold E / interact to buy.
    if (DOOR_DEFS.length) {
      const gs = useGameStore.getState()
      const px = camera.position.x, pz = camera.position.z
      let doorId = null, bestD = DOOR_REACH_SQ
      for (const d of DOOR_DEFS) {
        if (d.link || gs.openDoors[d.id]) continue
        const dx = px - d.x, dz = pz - d.z
        const dd = dx * dx + dz * dz
        if (dd < bestD) { bestD = dd; doorId = d.id }
      }
      gs.setNearDoorId(doorId)
      if (doorCooldownRef.current > 0) doorCooldownRef.current -= delta
      const eHeld = keys.current['KeyE'] || mobileInput.interactHeld
      const def = doorId ? DOOR_DEFS.find((d) => d.id === doorId) : null
      const status = def ? doorBuyStatus(def, DOOR_DEFS, gs.openDoors, gs.money) : 'open'
      if (def && eHeld && !shopOpenRef.current && !nearChestRef.current && doorCooldownRef.current <= 0 && (status === 'ok' || status === 'broke')) {
        if (status === 'broke') {
          if (!doorDeniedRef.current) { doorDeniedRef.current = true; playDoorDenied() }
        } else {
          if (doorHoldIdRef.current !== doorId) { doorHoldIdRef.current = doorId; doorHoldRef.current = 0 }
          doorHoldRef.current += delta
          gs.setDoorProgress(Math.min(doorHoldRef.current / DOOR_HOLD, 1))
          if (doorHoldRef.current >= DOOR_HOLD) {
            doorHoldRef.current = 0
            gs.setDoorProgress(0)
            if (gs.mpRole === 'guest' && gs.mpConnected) {
              // Guest: ask the host (authoritative); we pay when the host's door_open ack arrives.
              netSend('door_request', { id: doorId })
              doorCooldownRef.current = 1
            } else if (gs.buyDoor(doorId)) {
              netSend('door_open', { id: doorId, by: 'host' })
            }
          }
        }
      } else {
        if (!eHeld) doorDeniedRef.current = false
        if (doorHoldRef.current > 0 || doorHoldIdRef.current !== null) {
          doorHoldRef.current = 0
          doorHoldIdRef.current = null
          gs.setDoorProgress(0)
        }
      }
    }

    // Hold E to board or upgrade window planks (Carpenter speeds this up)
    {
      const BOARD_TIME = boardTimeForPerks(perksRef.current)
      const nearId = prevNearWindowRef.current
      const eHeld = keys.current['KeyE'] || mobileInput.interactHeld
      const plankCount = windowPlanksRef.current[nearId] ?? 0
      const isStrong = windowPlankStrongRef.current[nearId] ?? false
      const strongMode = strongPlanksModeRef.current
      const canAddPlank = plankCount < 2 && !(isStrong && !strongMode) && !(strongMode && !isStrong && plankCount > 0)
      const canUpgrade = strongMode && plankCount > 0 && !isStrong
      const canBoard = eHeld && nearId >= 0 && (canAddPlank || canUpgrade) && !nearChestRef.current && !useGameStore.getState().nearMachine

      if (canBoard) {
        if (boardingWindowRef.current !== nearId) {
          boardingWindowRef.current = nearId
          boardTimerRef.current = 0
        }
        boardTimerRef.current += delta
        const progress = Math.min(boardTimerRef.current / BOARD_TIME, 1)
        setBoardingProgress(progress)
        if (boardTimerRef.current >= BOARD_TIME) {
          if (canUpgrade) {
            upgradePlanks(nearId)
          } else if (canAddPlank) {
            addPlank(nearId)
            netSend('add_plank', { windowId: nearId })
          }
          boardTimerRef.current = 0
          setBoardingProgress(0)
        }
      } else {
        if (boardTimerRef.current > 0 || boardingWindowRef.current !== -1) {
          boardTimerRef.current = 0
          boardingWindowRef.current = -1
          setBoardingProgress(0)
        }
      }
    }

    // AK-47 auto-fire at 10 rounds/s while mouse held (deagle is semi-auto only; no auto-fire for knife)
    if (phase === 'playing' && weaponRef.current === 'ak47' && activeItemRef.current === 'gun' && ((mouseHeldRef.current && locked.current) || mobileInput.shootHeld || mobileInput.autoShootHeld)) {
      akFireTimerRef.current -= delta
      if (akFireTimerRef.current <= 0) {
        shoot()
        akFireTimerRef.current = 0.1
      }
    }

    // Hold T to skip intermission (2-second hold)
    if (phase === 'intermission') {
      if (keys.current['KeyT']) {
        skipTimerRef.current += delta
        setSkipProgress(Math.min(skipTimerRef.current / SKIP_TIME, 1))
        if (skipTimerRef.current >= SKIP_TIME) {
          skipTimerRef.current = 0
          setSkipProgress(0)
          skipIntermission()
          netSend('skip_intermission', {})
        }
      } else if (skipTimerRef.current > 0) {
        skipTimerRef.current = 0
        setSkipProgress(0)
      }
    }

    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    // Flamethrower — continuous spray while held, fuel-limited, cone damage ticks
    {
      const firing = phase === 'playing' && weaponRef.current === 'flamethrower' && activeItemRef.current === 'gun' &&
        ((mouseHeldRef.current && locked.current) || mobileInput.shootHeld || mobileInput.autoShootHeld)

      if (firing && useGameStore.getState().reserveBullets > 0) {
        consumeFuel(FLAME_FUEL_PER_SEC * delta)
        Gun.setFlameActive?.(true)
        kick('flamethrower')
        if (!flameSoundActiveRef.current) {
          flameSoundActiveRef.current = true
          startFlamethrowerSound()
        }

        const muzzle = Gun.getMuzzlePosition?.() ?? camera.position.clone()
        camera.getWorldDirection(_flameForward)
        FlameSpray.spray(muzzle, _flameForward, 2)
      } else {
        Gun.setFlameActive?.(false)
        if (flameSoundActiveRef.current) {
          flameSoundActiveRef.current = false
          stopFlamethrowerSound()
        }
      }

      // Burn DoT — runs whenever zombies are alight, even after the stream moves off
      // them or the trigger is released; each ignited zombie keeps burning for
      // FLAME_BURN_DURATION seconds.
      if (firing || burningZombiesRef.current.size > 0) {
        flameTickTimerRef.current -= delta
        if (flameTickTimerRef.current <= 0) {
          flameTickTimerRef.current = FLAME_TICK_INTERVAL
          const damage = FLAME_DPS * FLAME_TICK_INTERVAL * WR.damageMult('flamethrower', !!useGameStore.getState().upgradedWeapons.flamethrower)
          const burning = burningZombiesRef.current

          if (firing) {
            const muzzle = Gun.getMuzzlePosition?.() ?? camera.position.clone()
            camera.getWorldDirection(_flameForward)
            for (const [id, ref] of Object.entries(zombieRefs.current)) {
              if (!ref) continue
              ref.getWorldPosition(_flameZombiePos)
              _flameToZombie.copy(_flameZombiePos).sub(muzzle)
              const dist = _flameToZombie.length()
              if (dist > FLAME_RANGE || dist < 0.001) continue
              _flameToZombie.divideScalar(dist)
              if (_flameToZombie.dot(_flameForward) < FLAME_CONE_COS) continue
              burning.set(Number(id), FLAME_BURN_DURATION)
            }
          }

          for (const [zid, remaining] of burning) {
            const tickKill = hitZombieFlame(zid, damage)
            if (tickKill) deathSound(zombieRefs.current, zid)
            registerHit(tickKill ? 'kill' : 'burn')
            Zombie.ignite(zid)
            netSend('hit_zombie_flame', { id: zid, damage })

            const next = remaining - FLAME_TICK_INTERVAL
            if (next <= 0) burning.delete(zid)
            else burning.set(zid, next)
          }
        }
      } else {
        flameTickTimerRef.current = 0
      }
    }

    viewState.x = camera.position.x
    viewState.z = camera.position.z
    viewState.yaw = yaw.current

    // Keep AudioContext listener in sync with the camera so 3-D panning is correct
    setListenerPose(
      camera.position.x, camera.position.y, camera.position.z,
      -Math.sin(yaw.current), -Math.cos(yaw.current),
    )

    const dir = new THREE.Vector3()
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current))

    if (keys.current['KeyW'] || keys.current['ArrowUp']) dir.add(forward)
    if (keys.current['KeyS'] || keys.current['ArrowDown']) dir.sub(forward)
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) dir.sub(right)
    if (keys.current['KeyD'] || keys.current['ArrowRight']) dir.add(right)
    if (mobileInput.moveY !== 0) dir.addScaledVector(forward, mobileInput.moveY)
    if (mobileInput.moveX !== 0) dir.addScaledVector(right, mobileInput.moveX)

    let movedDist = 0
    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(moveSpeedForPerks(perksRef.current, bodyArmorRef.current) * delta)
      const R = 0.35
      const ws = wallsRef.current
      const cx = camera.position.x
      const cz = camera.position.z

      let nx = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, cx + dir.x))
      let nz = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, cz + dir.z))

      if (collidesWithWalls(nx, nz, R, ws)) {
        // try sliding on each axis separately
        const slideX = !collidesWithWalls(nx, cz, R, ws)
        const slideZ = !collidesWithWalls(cx, nz, R, ws)
        nx = slideX ? nx : cx
        nz = slideZ ? nz : cz
      }

      movedDist = Math.hypot(nx - cx, nz - cz)
      camera.position.x = nx
      camera.position.z = nz
      camera.position.y = PLAYER_HEIGHT

      // Footstep rhythm
      stepTimer.current -= delta
      if (stepTimer.current <= 0) {
        playFootstep()
        if (isConnected()) send('remote_sound', {
          sound: 'footstep',
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        })
        stepTimer.current = STEP_INTERVAL
      }
    } else {
      stepTimer.current = 0
    }

    // Camera weight: head bob + fire kick as offsets layered on top of aim (yaw/pitch
    // refs stay untouched, so recovery returns exactly to where the player was aiming).
    // Applied last so shoot()'s raycasts next frame use the on-screen crosshair.
    updateFeel(delta, delta > 0 ? movedDist / delta : 0, MOVE_SPEED,
      yaw.current - prevYaw.current, pitch.current - prevPitch.current, weaponRef.current)
    prevYaw.current = yaw.current
    prevPitch.current = pitch.current
    camera.rotation.y = yaw.current + feel.kickYaw
    camera.rotation.x = pitch.current + feel.kickPitch
    camera.rotation.z = feel.bobRoll + feel.kickRoll
    camera.position.y = PLAYER_HEIGHT + feel.bobY
  })

  return null
}
