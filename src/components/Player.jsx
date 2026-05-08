import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import BulletTrails from './BulletTrails'
import * as THREE from 'three'

const PLAYER_HEIGHT = 1.7
const MOVE_SPEED = 8
const LOOK_SENSITIVITY = 0.002
const ARENA_BOUND = 18.5

export default function Player() {
  const { camera, gl } = useThree()
  const killZombie = useGameStore((s) => s.killZombie)
  const phase = useGameStore((s) => s.phase)
  const zombies = useGameStore((s) => s.zombies)

  const yaw = useRef(0)
  const pitch = useRef(0)
  const keys = useRef({})
  const locked = useRef(false)
  const zombieRefs = useRef({})

  // Expose zombie ref registration
  Player.registerZombieRef = (id, ref) => { zombieRefs.current[id] = ref }
  Player.unregisterZombieRef = (id) => { delete zombieRefs.current[id] }

  useEffect(() => {
    camera.position.set(0, PLAYER_HEIGHT, 0)
    camera.rotation.order = 'YXZ'
  }, [camera])

  // Release pointer lock whenever the game leaves the playing state
  useEffect(() => {
    if (phase !== 'playing' && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [phase])

  const requestLock = useCallback(() => {
    if (phase === 'playing') gl.domElement.requestPointerLock()
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
    const onKeyDown = (e) => { keys.current[e.code] = true }
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

  // Click to shoot
  useEffect(() => {
    const onClick = () => {
      if (!locked.current) {
        requestLock()
        return
      }
      shoot()
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

    for (const [id, ref] of Object.entries(zombieRefs.current)) {
      if (!ref) continue
      const intersects = raycaster.intersectObject(ref, true)
      if (intersects.length > 0 && intersects[0].distance < closestDist) {
        closestDist = intersects[0].distance
        closest = id
        hitPoint = intersects[0].point
      }
    }

    // Trail: start slightly in front of camera, end at hit or 50 units out
    const trailStart = camera.position.clone().addScaledVector(raycaster.ray.direction, 0.5)
    const trailEnd = hitPoint ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 50)
    BulletTrails.add(trailStart, trailEnd)

    if (closest !== null) {
      killZombie(Number(closest))
    }
  }, [camera, killZombie])

  useFrame((_, delta) => {
    if (phase !== 'playing') return

    // Apply rotation
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    // Movement
    const dir = new THREE.Vector3()
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current))

    if (keys.current['KeyW'] || keys.current['ArrowUp']) dir.add(forward)
    if (keys.current['KeyS'] || keys.current['ArrowDown']) dir.sub(forward)
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) dir.sub(right)
    if (keys.current['KeyD'] || keys.current['ArrowRight']) dir.add(right)

    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(MOVE_SPEED * delta)
      const next = camera.position.clone().add(dir)
      next.x = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, next.x))
      next.z = Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, next.z))
      camera.position.copy(next)
      camera.position.y = PLAYER_HEIGHT
    }
  })

  return null
}
