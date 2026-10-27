import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { modFx, FOG_DEFAULT, FOG_THICK } from '../modifiers'
import { LOFI_ON } from './LofiPass'
import { feel } from '../cameraFeel'

// Wave 3 wave-modifier runtime. ONE useFrame eases `modFx` (read by Zombie AI, groan
// audio, LofiPass tint, LivingLights/Storm light multipliers) toward the active
// modifier's targets, animates the scene fog, and drives the Blackout flashlight.
//
// The flashlight SpotLight + cone are mounted from game start and only change
// intensity/opacity (never visible/mount), so Blackout starting never changes the
// light count or compiles a shader program mid-wave. No castShadow.

const EASE = 1.6            // 1/s: modifier on/off transition speed
const BLACKOUT_POINT = 0.0  // interior bulbs fully off
const BLACKOUT_AMB = 0.03   // ambient / moon / hemisphere fill kept at this fraction
const BLACKOUT_FIRE = 0.2   // fireplace keeps this fraction (still flickers)
const BLACKOUT_EXPOSURE = 0.6 // final-pass exposure factor (x LOFI_EXPOSURE x player brightness)
const FLASH_INTENSITY = 150   // three r167 physical units: ~6 at 5 m with decay 1.2; 220 blew zombies out to white
const FLASH_ANGLE = 0.45
const FLASH_PENUMBRA = 0.5
const FLASH_DECAY = 1.2
const FLASH_DISTANCE = 16
const FLASH_AIM = 10          // beam converges on a point this far along the camera forward
// Left-hand offset from the camera, in camera space (x right, y up, -z forward).
const HAND = new THREE.Vector3(-0.26, -0.2, -0.32)
const LENS_Z = -0.11          // lens centre ahead of the hand origin (hand-local -z)
const FOG_RED = new THREE.Color('#3a0c0c')   // Bloodlust fallback when lofi is off
const _fogBase = new THREE.Color('#0b1118')
const _dir = new THREE.Vector3()
const _off = new THREE.Vector3()
const _lens = new THREE.Vector3()

const _armGeo = new THREE.BoxGeometry(0.075, 0.075, 0.28)
const _bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10)
const _headGeo = new THREE.CylinderGeometry(0.046, 0.034, 0.06, 10)
const _lensGeo = new THREE.CircleGeometry(0.04, 10)
const _armMat = new THREE.MeshBasicMaterial({ color: '#3d4d2f', depthTest: false })
const _bodyMat = new THREE.MeshBasicMaterial({ color: '#6a6a74', depthTest: false })
const _lensMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', depthTest: false })

const approach = (cur, target, k) => cur + (target - cur) * k

export default function ModifierFx() {
  const scene = useThree((s) => s.scene)
  const spot = useMemo(() => {
    const l = new THREE.SpotLight('#fff0d0', 0, FLASH_DISTANCE, FLASH_ANGLE, FLASH_PENUMBRA, FLASH_DECAY)
    l.castShadow = false
    return l
  }, [])
  // First-person flashlight model (unlit meshBasicMaterial: no lighting cost, nothing
  // else is lit by it). Lives in the main scene, posed from the camera each frame.
  const hand = useRef()

  useFrame((state, rawDelta) => {
    const gs = useGameStore.getState()
    const active = gs.phase === 'playing' ? gs.waveModifier : null
    modFx.active = active
    const k = 1 - Math.exp(-EASE * Math.min(rawDelta, 0.1))

    modFx.speedMul = active === 'bloodlust' ? 2 : 1
    modFx.groanGain = approach(modFx.groanGain, active === 'fog' ? 2.6 : 1, k)
    modFx.groanReach = approach(modFx.groanReach, active === 'fog' ? 1.8 : 1, k)
    modFx.tint = approach(modFx.tint, active === 'bloodlust' ? 1 : 0, k)
    modFx.lightMul = approach(modFx.lightMul, active === 'blackout' ? BLACKOUT_POINT : 1, k)
    modFx.ambMul = approach(modFx.ambMul, active === 'blackout' ? BLACKOUT_AMB : 1, k)
    modFx.fireMul = approach(modFx.fireMul, active === 'blackout' ? BLACKOUT_FIRE : 1, k)
    modFx.flashlight = approach(modFx.flashlight, active === 'blackout' ? 1 : 0, k * 1.5)
    if (modFx.flashlight < 0.002 && active !== 'blackout') modFx.flashlight = 0

    // Fog: near/far are plain uniforms, so animating them never recompiles anything.
    const fog = scene.fog
    if (fog) {
      const thick = active === 'fog'
      fog.near = approach(fog.near, thick ? FOG_THICK.near : FOG_DEFAULT.near, k)
      fog.far = approach(fog.far, thick ? FOG_THICK.far : FOG_DEFAULT.far, k)
      // Lofi off: no colour grade to carry the red, so tint the fog instead.
      if (!LOFI_ON) fog.color.copy(_fogBase).lerp(FOG_RED, modFx.tint)
    }

    modFx.exposureMul = approach(modFx.exposureMul, active === 'blackout' ? BLACKOUT_EXPOSURE : 1, k)

    // Flashlight is held in the LEFT hand: camera-space offset + the same bob/sway as the
    // gun viewmodel, aimed so the beam converges near the crosshair. Intensity-only toggling.
    const cam = state.camera
    spot.intensity = FLASH_INTENSITY * modFx.flashlight
    const h = hand.current
    if (h) {
      h.visible = modFx.flashlight > 0.02
      if (h.visible) {
        _off.copy(HAND)
        _off.x += feel.lagX * 0.8 + feel.gunBobX
        _off.y += -feel.lagY * 0.8 + feel.gunBobY
        _off.applyQuaternion(cam.quaternion)
        h.position.copy(cam.position).add(_off)
        h.quaternion.copy(cam.quaternion)
        h.rotateY(-0.06)   // toe in a little toward the crosshair
        _lens.set(0, 0, LENS_Z).applyQuaternion(h.quaternion)
        spot.position.copy(h.position).add(_lens)
      }
    }
    if (!h || !h.visible) {
      _off.copy(HAND).applyQuaternion(cam.quaternion)
      spot.position.copy(cam.position).add(_off)
    }
    cam.getWorldDirection(_dir)
    spot.target.position.copy(cam.position).addScaledVector(_dir, FLASH_AIM)
    spot.target.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={spot} />
      <primitive object={spot.target} />
      <group ref={hand} visible={false}>
        {/* sleeve / hand */}
        <mesh position={[0, -0.015, 0.1]} geometry={_armGeo} material={_armMat} renderOrder={8} />
        {/* torch body + head ring */}
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} geometry={_bodyGeo} material={_bodyMat} renderOrder={8} />
        <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]} geometry={_headGeo} material={_bodyMat} renderOrder={8} />
        {/* lens */}
        <mesh position={[0, 0, -0.137]} rotation={[Math.PI / 2, 0, 0]} geometry={_lensGeo} material={_lensMat} renderOrder={9} />
      </group>
    </>
  )
}
