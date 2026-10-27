import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { modFx, FOG_DEFAULT, FOG_THICK } from '../modifiers'
import { LOFI_ON } from './LofiPass'

// Wave 3 wave-modifier runtime. ONE useFrame eases `modFx` (read by Zombie AI, groan
// audio, LofiPass tint, LivingLights/Storm light multipliers) toward the active
// modifier's targets, animates the scene fog, and drives the Blackout flashlight.
//
// The flashlight SpotLight + cone are mounted from game start and only change
// intensity/opacity (never visible/mount), so Blackout starting never changes the
// light count or compiles a shader program mid-wave. No castShadow.

const EASE = 1.6            // 1/s: modifier on/off transition speed
const BLACKOUT_POINT = 0.0  // interior bulbs fully off
const BLACKOUT_AMB = 0.1    // ambient / moon / hemisphere fill kept at this fraction
const BLACKOUT_FIRE = 0.4   // fireplace keeps this fraction (still flickers)
const FLASH_INTENSITY = 16
const FLASH_ANGLE = 0.42
const FLASH_DISTANCE = 22
const CONE_OPACITY = 0.07
const FOG_RED = new THREE.Color('#3a0c0c')   // Bloodlust fallback when lofi is off
const _fogBase = new THREE.Color('#0b1118')
const _dir = new THREE.Vector3()
const _off = new THREE.Vector3()

const approach = (cur, target, k) => cur + (target - cur) * k

export default function ModifierFx() {
  const scene = useThree((s) => s.scene)
  const spot = useMemo(() => {
    const l = new THREE.SpotLight('#fff0d0', 0, FLASH_DISTANCE, FLASH_ANGLE, 0.6, 2)
    l.castShadow = false
    return l
  }, [])
  const cone = useMemo(() => {
    // Open cone, apex at the camera, opening forward (-Z): faint additive volume.
    const g = new THREE.ConeGeometry(Math.tan(FLASH_ANGLE) * 9, 9, 20, 1, true)
    g.translate(0, -4.5, 0)         // apex at the origin, base 9 below
    g.rotateX(Math.PI / 2)          // ...then base 9 ahead along -Z
    const m = new THREE.MeshBasicMaterial({
      color: '#ffe9b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.frustumCulled = false
    mesh.renderOrder = 7
    return mesh
  }, [])

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

    // Flashlight rides the camera. Intensity-only toggling (see header).
    const cam = state.camera
    spot.intensity = FLASH_INTENSITY * modFx.flashlight
    cam.getWorldDirection(_dir)
    _off.set(0.18, -0.14, 0).applyQuaternion(cam.quaternion)
    spot.position.copy(cam.position).add(_off)
    spot.target.position.copy(cam.position).addScaledVector(_dir, 6)
    spot.target.updateMatrixWorld()
    cone.position.copy(spot.position)
    cone.quaternion.copy(cam.quaternion)
    cone.material.opacity = CONE_OPACITY * modFx.flashlight
  })

  return (
    <>
      <primitive object={spot} />
      <primitive object={spot.target} />
      <primitive object={cone} />
    </>
  )
}
