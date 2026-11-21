// Movement: look (mobile), camera aim, walking with wall collision, footsteps, camera feel, the downed eye height.
// Moved verbatim out of components/Player.jsx.
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { viewState } from '../viewState'
import { useGameStore } from '../store'
import { playFootstep, setListenerPose } from '../sounds'
import { collidesWithWalls } from '../walls'
import { feel, updateFeel, resetFeel } from '../cameraFeel'
import { send, isConnected } from '../net'
import { mobileInput } from '../mobileInput'
import { getSettings } from '../settings'
import { DOWN_SPEED_MULT, DOWN_EYE_HEIGHT } from '../coopDown'
import { moveSpeedForPerks, PLAYER_HEIGHT, MOVE_SPEED, MOBILE_LOOK_SENSITIVITY, ARENA_BOUND, STEP_INTERVAL } from './constants'

export default function usePlayerMovement(P) {
  const { camera, phase, weaponRef, perksRef, yaw, pitch, keys } = P

  const wave = useGameStore((s) => s.wave)

  const bodyArmor = useGameStore((s) => s.bodyArmor)

  const walls = useGameStore((s) => s.walls)
  const wallsRef = useRef(walls)

  const eyeYRef = useRef(PLAYER_HEIGHT)

  const bodyArmorRef = useRef(bodyArmor)

  const stepTimer = useRef(0)
  const prevYaw = useRef(0)
  const prevPitch = useRef(0)

  useEffect(() => { wallsRef.current = walls }, [walls])

  useEffect(() => { bodyArmorRef.current = bodyArmor }, [bodyArmor])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  // Dev/preview-only handle for browser tests (same gating as the ?wave= debug params)
  useEffect(() => {
    if (import.meta.env.VITE_VERCEL_ENV === 'production') return
    window.__dbg = { camera, feel, store: useGameStore, yaw, pitch, keys }
  }, [camera, keys, pitch, yaw])

  // Reset position + look direction only when starting a fresh game (wave 1)
  useEffect(() => {
    if (phase === 'intermission' && wave === 1) {
      camera.position.set(0, PLAYER_HEIGHT, 0)
      yaw.current = 0
      pitch.current = 0
      resetFeel()
    }
  }, [phase, wave, camera, pitch, yaw])

  function look(mobileLook) {
    if (mobileLook.x !== 0 || mobileLook.y !== 0) {
      const sens = MOBILE_LOOK_SENSITIVITY * getSettings().lookSensitivity
      yaw.current -= mobileLook.x * sens
      pitch.current -= mobileLook.y * sens
      pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch.current))
    }
  }

  function aim() {
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current
  }

  function move(delta, myStatus, downed) {
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
    if (myStatus === 'dead') dir.set(0, 0, 0)   // W5: bled out - waiting for the wave to end

    let movedDist = 0
    if (dir.lengthSq() > 0) {
      // Analog: only clamp to unit length (keys give 1 or 1.41 -> full speed; a light stick push stays slow)
      if (dir.lengthSq() > 1) dir.normalize()
      dir.multiplyScalar(moveSpeedForPerks(perksRef.current, bodyArmorRef.current) * (downed ? DOWN_SPEED_MULT : 1) * delta)
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
      camera.position.y = eyeYRef.current

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
    camera.rotation.y = yaw.current + feel.kickYaw + feel.shakeX
    camera.rotation.x = pitch.current + feel.kickPitch + feel.shakeY
    camera.rotation.z = feel.bobRoll + feel.kickRoll + feel.shakeRoll
    // W5: eye height eases down to ~0.5 m while downed / bled out, back up when revived
    eyeYRef.current += ((downed ? DOWN_EYE_HEIGHT : PLAYER_HEIGHT) - eyeYRef.current) * Math.min(1, delta * 6)
    camera.position.y = eyeYRef.current + feel.bobY * (downed ? 0.15 : 1)
  }

  return { look, aim, move }
}
