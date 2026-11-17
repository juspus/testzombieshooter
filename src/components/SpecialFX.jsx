import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import { time } from '../timeScale'
import { globMesh, puddleMesh, flashMesh, updateSpecialFx, clearSpecialFx } from '../specialFxPool'

// Pooled exploder flash + spitter globs / acid puddles. Spawn through specialFxPool
// (spawnFlash(x, y, z), spawnScorch(x, z), spawnGlob(x0, y0, z0, x1, z1, flight)); this component only
// draws and steps them.
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

