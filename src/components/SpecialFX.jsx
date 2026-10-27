import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import { time } from '../timeScale'
import { globMesh, puddleMesh, flashMesh, updateSpecialFx, clearSpecialFx, spawnGlob, spawnScorch, spawnFlash } from '../specialFxPool'

// Pooled exploder flash + spitter globs / acid puddles. Static emitters, like
// ImpactFX.spawn / BloodFX.spawn:
//   SpecialFX.flash(x, y, z)  SpecialFX.scorch(x, z)  SpecialFX.spit(x0, y0, z0, x1, z1, flight)
export default function SpecialFX() {
  useFrame((state, delta) => {
    if (useGameStore.getState().paused) return
    const dt = Math.min(delta, 0.05) * time.scale
    const { camera } = state
    updateSpecialFx(dt, camera.position.x, camera.position.z, useGameStore.getState().phase === 'playing')
  })

  // Puddles live for the wave only (new run / next wave pass through 'intermission')
  useEffect(() => {
    if (!useGameStore.subscribe) return   // mocked store (tests)
    let prev = useGameStore.getState().phase
    return useGameStore.subscribe((s) => {
      if (s.phase === prev) return
      prev = s.phase
      if (s.phase === 'intermission' || s.phase === 'start') clearSpecialFx()
    })
  }, [])

  return (
    <>
      <primitive object={globMesh} />
      <primitive object={puddleMesh} />
      <primitive object={flashMesh} />
    </>
  )
}

SpecialFX.flash = spawnFlash
SpecialFX.scorch = spawnScorch
SpecialFX.spit = spawnGlob
