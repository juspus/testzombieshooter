import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import Gun from './Gun'
import BulletTrails from './BulletTrails'
import { Zombie } from './Zombie'
import { playGunshot, playEmptyClick, playReload, playZombieDie, playFootstep } from '../sounds'
import { collidesWithWalls } from '../walls'
import { WINDOW_DEFS } from '../cabin'
import * as THREE from 'three'

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
  const consumeBullet = useGameStore((s) => s.consumeBullet)
  const beginReload = useGameStore((s) => s.beginReload)
  const finishReload = useGameStore((s) => s.finishReload)
  const addPlank = useGameStore((s) => s.addPlank)
  const setNearWindowId = useGameStore((s) => s.setNearWindowId)
  const setBoardingProgress = useGameStore((s) => s.setBoardingProgress)
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const walls = useGameStore((s) => s.walls)
  const wallsRef = useRef(walls)
  const windowPlanksRef = useRef(windowPlanks)
  const prevNearWindowRef = useRef(-1)
  const boardTimerRef = useRef(0)
  const boardingWindowRef = useRef(-1)

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

  const requestLock = useCallback(() => {
    if (phase === 'playing' || phase === 'intermission') gl.domElement.requestPointerLock()
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
      if (e.code === 'KeyR' && beginReload()) {
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

  useEffect(() => {
    const onClick = () => {
      if (!locked.current) { requestLock(); return }
      if (phase === 'playing') shoot()
    }
    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [gl, requestLock])

  const shoot = useCallback(() => {
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera({ x: 0, y: 0 }, camera)

    let closest = null
    let closestDist = Infinity
    let hitPoint = null
    let isHeadshot = false
    let hitFaceNormal = null

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

    if (!consumeBullet()) { playEmptyClick(); return }  // empty clip or reloading

    const muzzle = Gun.getMuzzlePosition?.() ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 0.5)
    const trailEnd = hitPoint ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
    BulletTrails.add(muzzle, trailEnd)
    Gun.fire?.()
    playGunshot()

    if (closest !== null) {
      const id = Number(closest)
      const zombieRef = zombieRefs.current[closest]

      // Place bullet hole on torso hits only
      if (!isHeadshot && hitPoint && zombieRef && hitFaceNormal) {
        const localPos = zombieRef.worldToLocal(hitPoint)
        // Nudge slightly along normal to avoid z-fighting
        localPos.addScaledVector(hitFaceNormal, 0.012)
        Zombie.addBulletHole(id, localPos, hitFaceNormal)
      }

      const killed = hitZombie(id, isHeadshot)
      if (killed) playZombieDie()
    }
  }, [camera, hitZombie, consumeBullet])

  useFrame((_, delta) => {
    if (phase !== 'playing' && phase !== 'intermission') return

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

    // Hold E to board window (2 seconds per plank)
    {
      const BOARD_TIME = 2.0
      const nearId = prevNearWindowRef.current
      const eHeld = keys.current['KeyE']
      const canBoard = eHeld && nearId >= 0 && (windowPlanksRef.current[nearId] ?? 0) < 2

      if (canBoard) {
        if (boardingWindowRef.current !== nearId) {
          // Switched to a different window — reset timer
          boardingWindowRef.current = nearId
          boardTimerRef.current = 0
        }
        boardTimerRef.current += delta
        const progress = Math.min(boardTimerRef.current / BOARD_TIME, 1)
        setBoardingProgress(progress)
        if (boardTimerRef.current >= BOARD_TIME) {
          addPlank(nearId)
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
