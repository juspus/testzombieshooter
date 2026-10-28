import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import { createGovernor, GOV_LEVELS, govInfo } from '../frameGovernor'
import { LOFI_ON, setLofiHeight, LOFI_HEIGHT } from './LofiPass'

// Invisible automatic frame governor (state machine lives in src/frameGovernor.js).
// Reads the RAW frame delta (not time.scale) and applies the level to the lo-fi pass
// height and the shadow-map cadence. It never touches lights or materials.
// Off when the lo-fi pass is off (?lofi=0) or with ?gov=0 (dev/preview only).
const ALLOWED = import.meta.env.VITE_VERCEL_ENV !== 'production'
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
export const GOV_ON = LOFI_ON && !(ALLOWED && params?.get('gov') === '0')

export default function FrameGovernor() {
  const gl = useThree((s) => s.gl)
  const gov = useMemo(() => createGovernor(), [])
  const state = useMemo(() => ({ frame: 0 }), [])

  useEffect(() => {
    govInfo.enabled = GOV_ON
    if (ALLOWED) window.__gov = gov   // dev/preview: inspect or reset from the console
    return () => {
      govInfo.enabled = false
      setLofiHeight(LOFI_HEIGHT)
      if (gl.shadowMap) gl.shadowMap.autoUpdate = true
      if (ALLOWED && window.__gov === gov) delete window.__gov
    }
  }, [gov, gl])

  useFrame((_, delta) => {
    if (!GOV_ON) return
    const phase = useGameStore.getState().phase
    if (phase === 'playing' || phase === 'intermission') {
      const dir = gov.update(delta * 1000)
      if (dir !== 0) setLofiHeight(GOV_LEVELS[gov.level].height)
      govInfo.level = gov.level
      govInfo.ema = gov.ema
    }
    // Shadow cadence: skip the shadow pass on alternate frames at the last level.
    // needsUpdate is consumed by the first scene render of this frame (priority 0 runs before Gun/Knife).
    const every = GOV_LEVELS[gov.level].shadowEvery
    const sm = gl.shadowMap
    if (every > 1) {
      sm.autoUpdate = false
      if ((state.frame++ % every) === 0) sm.needsUpdate = true
    } else if (!sm.autoUpdate) {
      sm.autoUpdate = true
    }
  })

  return null
}
