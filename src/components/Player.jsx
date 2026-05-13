import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import Gun from './Gun'
import Knife from './Knife'
import BulletTrails from './BulletTrails'
import ShellCasings from './ShellCasings'
import { Zombie } from './Zombie'
import { playGunshot, playEmptyClick, playReload, playZombieDie, playFootstep, playPumpAction, playShellThonk, playKnifeSwing } from '../sounds'
import { collidesWithWalls } from '../walls'
import { WINDOW_DEFS } from '../cabin'
import { CHEST_POS } from './Arena'
import * as THREE from 'three'

const CHEST_RADIUS_SQ = 1.5 * 1.5
const KNIFE_COOLDOWN = 0.4
const KNIFE_RANGE = 2.2

const PLAYER_HEIGHT = 1.7
const MOVE_SPEED = 8
const LOOK_SENSITIVITY = 0.002
const ARENA_BOUND = 18.5
const STEP_INTERVAL = 0.42

export default function Player() {
  const { camera, gl } = useThree()
  const hitZombie = useGameStore((s) => s.hitZombie)
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const activeItem = useGameStore((s) => s.activeItem)
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
  const skipTimerRef = useRef(0)
  const shopOpenRef = useRef(false)
  const nearChestRef = useRef(false)
  const mouseHeldRef = useRef(false)
  const akFireTimerRef = useRef(0)
  const shotgunCooldownRef = useRef(0)
  const knifeCooldownRef = useRef(0)
  const weapon = useGameStore((s) => s.weapon)
  const weaponRef = useRef(weapon)
  const activeItemRef = useRef(activeItem)

  const yaw = useRef(0)
  const pitch = useRef(0)
  const keys = useRef({})
  const locked = useRef(false)
  const zombieRefs = useRef({})
  const reloadTimer = useRef(0)
  const stepTimer = useRef(0)
  const RELOAD_TIME = 1.5

  Player.registerZombieRef = (id, ref) => { zombieRefs.current[id] = ref }
  Player.unregisterZombieRef = (id) => { delete zombieRefs.current[id] }

  useEffect(() => { wallsRef.current = walls }, [walls])
  useEffect(() => { windowPlanksRef.current = windowPlanks }, [windowPlanks])
  useEffect(() => { windowPlankStrongRef.current = windowPlankStrong }, [windowPlankStrong])
  useEffect(() => { strongPlanksModeRef.current = strongPlanksMode }, [strongPlanksMode])
  useEffect(() => { weaponRef.current = weapon }, [weapon])
  useEffect(() => { activeItemRef.current = activeItem }, [activeItem])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  // Reset position + look direction only when starting a fresh game (wave 1)
  useEffect(() => {
    if (phase === 'intermission' && wave === 1) {
      camera.position.set(0, PLAYER_HEIGHT, 0)
      yaw.current = 0
      pitch.current = 0
    }
  }, [phase, wave, camera])

  // Sync shopOpen ref and manage pointer lock
  useEffect(() => {
    shopOpenRef.current = shopOpen
    if (shopOpen) document.exitPointerLock()
  }, [shopOpen])

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
      if (!locked.current) return
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
        reloadTimer.current = RELOAD_TIME
        playReload()
      }
    }
    const onKeyUp = (e) => { keys.current[e.code] = false }

    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [gl])

  const shoot = useCallback(() => {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    if (weaponRef.current === 'shotgun' && shotgunCooldownRef.current > 0) return

    if (!consumeBullet()) { playEmptyClick(); return }

    const muzzle = Gun.getMuzzlePosition?.() ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 0.5)
    Gun.fire?.()
    playGunshot()

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
      for (let i = 0; i < PELLETS; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * SPREAD  // sqrt for even circular distribution
        const pelletRC = new THREE.Raycaster()
        pelletRC.setFromCamera({ x: Math.cos(angle) * r, y: Math.sin(angle) * r }, camera)
        let bestId = null, bestDist = Infinity, bestPoint = null, bestHead = false
        for (const [id, ref] of Object.entries(zombieRefs.current)) {
          if (!ref) continue
          const hits = pelletRC.intersectObject(ref, true)
          if (hits.length > 0 && hits[0].distance < bestDist) {
            bestDist = hits[0].distance
            bestId = Number(id)
            bestPoint = hits[0].point.clone()
            bestHead = hits[0].object.userData.isHead === true
          }
        }
        const trailEnd = bestPoint ?? camera.position.clone().addScaledVector(pelletRC.ray.direction, 30)
        BulletTrails.add(muzzle, trailEnd)
        if (bestId !== null) {
          const died = hitZombie(bestId, bestHead)
          if (died && !killed.has(bestId)) { killed.add(bestId); playZombieDie() }
        }
      }
    } else if (weaponRef.current === 'deagle') {
      // Pierce up to 3 enemies, instant kill each
      const hits = []
      for (const [id, ref] of Object.entries(zombieRefs.current)) {
        if (!ref) continue
        const intersects = raycaster.intersectObject(ref, true)
        if (intersects.length > 0) hits.push({ id: Number(id), dist: intersects[0].distance, point: intersects[0].point.clone() })
      }
      hits.sort((a, b) => a.dist - b.dist)
      const targets = hits.slice(0, 3)
      const trailEnd = targets.length > 0 ? targets[targets.length - 1].point : camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
      BulletTrails.add(muzzle, trailEnd)
      for (const target of targets) {
        if (hitZombie(target.id, true)) playZombieDie()
      }
    } else {
      // Single target
      let closest = null, closestDist = Infinity, hitPoint = null, isHeadshot = false, hitFaceNormal = null
      for (const [id, ref] of Object.entries(zombieRefs.current)) {
        if (!ref) continue
        const intersects = raycaster.intersectObject(ref, true)
        if (intersects.length > 0 && intersects[0].distance < closestDist) {
          closestDist = intersects[0].distance
          closest = id
          hitPoint = intersects[0].point.clone()
          isHeadshot = intersects[0].object.userData.isHead === true
          hitFaceNormal = intersects[0].face?.normal.clone() ?? new THREE.Vector3(0, 0, 1)
        }
      }
      const trailEnd = hitPoint ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
      BulletTrails.add(muzzle, trailEnd)
      if (closest !== null) {
        const id = Number(closest)
        const zombieRef = zombieRefs.current[closest]
        if (!isHeadshot && hitPoint && zombieRef && hitFaceNormal) {
          const localPos = zombieRef.worldToLocal(hitPoint)
          localPos.addScaledVector(hitFaceNormal, 0.012)
          Zombie.addBulletHole(id, localPos, hitFaceNormal)
        }
        if (hitZombie(id, isHeadshot)) playZombieDie()
      }
    }
  }, [camera, hitZombie, consumeBullet])

  const knifeSwing = useCallback(() => {
    if (knifeCooldownRef.current > 0) return

    Knife.swing?.()
    playKnifeSwing()
    knifeCooldownRef.current = KNIFE_COOLDOWN
    setKnifeCooldown(KNIFE_COOLDOWN)

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
      if (dist > KNIFE_RANGE) continue
      const toZombie = zombiePos.clone().sub(camPos).normalize()
      if (fwd.dot(toZombie) < 0.1) continue  // must be in roughly forward 160° arc
      if (dist < closestDist) { closestDist = dist; closestId = id }
    }

    if (closestId !== null) {
      if (hitZombie(Number(closestId), true, 'knife')) playZombieDie()
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
    if (shopOpen) return

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

    // Hold E to board or upgrade window planks (2 seconds)
    {
      const BOARD_TIME = 2.0
      const nearId = prevNearWindowRef.current
      const eHeld = keys.current['KeyE']
      const plankCount = windowPlanksRef.current[nearId] ?? 0
      const isStrong = windowPlankStrongRef.current[nearId] ?? false
      const strongMode = strongPlanksModeRef.current
      const canAddPlank = plankCount < 2
      const canUpgrade = strongMode && plankCount > 0 && !isStrong
      const canBoard = eHeld && nearId >= 0 && (canAddPlank || canUpgrade) && !nearChestRef.current

      if (canBoard) {
        if (boardingWindowRef.current !== nearId) {
          boardingWindowRef.current = nearId
          boardTimerRef.current = 0
        }
        boardTimerRef.current += delta
        const progress = Math.min(boardTimerRef.current / BOARD_TIME, 1)
        setBoardingProgress(progress)
        if (boardTimerRef.current >= BOARD_TIME) {
          if (canAddPlank) addPlank(nearId)
          else upgradePlanks(nearId)
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
    if (phase === 'playing' && weaponRef.current === 'ak47' && activeItemRef.current === 'gun' && mouseHeldRef.current && locked.current) {
      akFireTimerRef.current -= delta
      if (akFireTimerRef.current <= 0) {
        shoot()
        akFireTimerRef.current = 0.1
      }
    }

    // Hold T to skip intermission (2-second hold)
    if (phase === 'intermission') {
      const SKIP_TIME = 1.0
      if (keys.current['KeyT']) {
        skipTimerRef.current += delta
        setSkipProgress(Math.min(skipTimerRef.current / SKIP_TIME, 1))
        if (skipTimerRef.current >= SKIP_TIME) {
          skipTimerRef.current = 0
          setSkipProgress(0)
          skipIntermission()
        }
      } else if (skipTimerRef.current > 0) {
        skipTimerRef.current = 0
        setSkipProgress(0)
      }
    }

    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    const dir = new THREE.Vector3()
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current))

    if (keys.current['KeyW'] || keys.current['ArrowUp']) dir.add(forward)
    if (keys.current['KeyS'] || keys.current['ArrowDown']) dir.sub(forward)
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) dir.sub(right)
    if (keys.current['KeyD'] || keys.current['ArrowRight']) dir.add(right)

    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(MOVE_SPEED * delta)
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

      camera.position.x = nx
      camera.position.z = nz
      camera.position.y = PLAYER_HEIGHT

      // Footstep rhythm
      stepTimer.current -= delta
      if (stepTimer.current <= 0) {
        playFootstep()
        stepTimer.current = STEP_INTERVAL
      }
    } else {
      stepTimer.current = 0
    }
  })

  return null
}
