import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'

// Debug-only frame budget overlay (?perf) and bench scene camera (?bench).
// Same gating as the ?wave=/?money= params: dev + Vercel preview only.
const ALLOWED = import.meta.env.VITE_VERCEL_ENV !== 'production'
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
export const PERF_ON = ALLOWED && !!params?.has('perf')
export const BENCH_ON = ALLOWED && !!params?.has('bench')

const WINDOW = 60          // frames kept for avg / worst
const REFRESH = 0.25       // seconds between DOM writes (~4 Hz)
const BENCH_POS = [0, 1.7, 0] // player eye position for ?bench (yaw 0 = looks down -Z)

const frames = new Float32Array(WINDOW)
let n = 0
let acc = 0
let fpsEma = 0
let el = null

// Mounted once inside <Canvas>. Renders nothing; the overlay is a plain DOM node
// whose text is written at ~4 Hz, so there is no React work per frame.
export default function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const phase = useGameStore((s) => s.phase)

  useEffect(() => {
    if (!PERF_ON) return
    el = document.createElement('pre')
    el.setAttribute('data-perf-overlay', '')
    // Top-left: clear of the centred wave/kills banner and the lower-corner
    // sticks/buttons on mobile.
    el.style.cssText = 'position:fixed;left:max(4px,env(safe-area-inset-left));top:max(4px,env(safe-area-inset-top));' +
      'margin:0;padding:3px 6px;font:10px/1.25 monospace;color:#9f9;background:rgba(0,0,0,.6);' +
      'pointer-events:none;z-index:9999;white-space:pre;border-radius:4px;text-align:left'
    document.body.appendChild(el)
    // Count the whole frame (shadow pass + main pass): disable auto reset and reset
    // by hand once per frame in the useFrame below.
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
      el?.remove()
      el = null
    }
  }, [gl])

  // Bench: fixed player spot. Yaw/pitch default to 0 so the view is deterministic.
  useEffect(() => {
    if (BENCH_ON && phase !== 'start') camera.position.set(BENCH_POS[0], BENCH_POS[1], BENCH_POS[2])
  }, [phase, camera])

  useFrame((_, delta) => {
    if (!el || delta <= 0) return
    const { info } = gl
    // Runs before this frame's render, so info still holds the previous full frame
    // (all passes). Read it, then zero it for the frame about to be drawn.
    const calls = info.render.calls
    const tris = info.render.triangles
    info.reset()

    frames[n % WINDOW] = delta * 1000
    n++
    fpsEma = fpsEma ? fpsEma + (1 / delta - fpsEma) * 0.1 : 1 / delta
    acc += delta
    if (acc < REFRESH) return
    acc = 0

    const len = Math.min(n, WINDOW)
    let sum = 0
    let worst = 0
    for (let i = 0; i < len; i++) { const f = frames[i]; sum += f; if (f > worst) worst = f }
    let live = 0
    const zs = useGameStore.getState().zombies
    for (let i = 0; i < zs.length; i++) if (!zs[i].dying) live++
    const m = info.memory
    el.textContent =
      `${fpsEma.toFixed(0)} fps  ${(sum / len).toFixed(1)}ms avg  ${worst.toFixed(1)}ms worst\n` +
      `${calls} draws  ${(tris / 1000).toFixed(1)}k tris  ${live} zombies\n` +
      `geo ${m.geometries}  tex ${m.textures}  prog ${info.programs?.length ?? 0}`
  })

  return null
}
