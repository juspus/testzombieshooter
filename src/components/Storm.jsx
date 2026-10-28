import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../store'
import { getMap } from '../maps'
import { startRain, stopRain, setRainIndoor, playThunder } from '../sounds'
import { weather, FX_DEBUG, FX_OFF } from '../weather'
import { modFx } from '../modifiers'
import { lightReg } from './LivingLights'

// Thunderstorm: randomized lightning that flashes the moonlight, the hemisphere
// fill and the skybox (silhouetting trees / zombies outside), plus rain + thunder
// audio. Works on any map: it finds the scene's first directional + hemisphere
// light once instead of owning them. Single useFrame, no per-frame allocations,
// no lights or shadow casters added.

const MAX_PULSES = 4
const MOON_BOOST = 9      // added to directional intensity at flash = 1
const HEMI_BOOST = 3.5    // added to hemisphere intensity at flash = 1
const SKY_BOOST_R = 26    // skybox colour multiplier added at flash = 1 (r,g,b)
const SKY_BOOST_G = 30
const SKY_BOOST_B = 42
const FIRST_FLASH_S = 7
const GAP_PLAYING = [20, 40]       // seconds between strikes during a wave
const GAP_INTERMISSION = [40, 60]  // ... between waves

const pStart = new Float32Array(MAX_PULSES)
const pAmp = new Float32Array(MAX_PULSES)
const pDecay = new Float32Array(MAX_PULSES)

export default function Storm() {
  const { scene } = useThree()
  const moon = useRef(null)
  const hemi = useRef(null)
  const flashT0 = useRef(-1e9)
  const nPulses = useRef(0)
  const nextIn = useRef(FIRST_FLASH_S)
  const indoor = useRef(null)
  const dims = useRef({ hw: 9, hd: 10 })
  const wasFlashing = useRef(false)
  const lastAmbMul = useRef(1)
  const extras = useRef([])   // ambient lights LivingLights doesn't own (e.g. the diner's)

  const trigger = useRef(null)
  trigger.current = (distance) => {
    const d = distance ?? Math.random()
    // 2-4 flickers: a hard first hit, then quick re-strikes, last one lingers.
    const n = 2 + Math.floor(Math.random() * (MAX_PULSES - 1))
    let t = 0
    for (let i = 0; i < n; i++) {
      pStart[i] = t
      pAmp[i] = i === 0 ? 1 : 0.45 + Math.random() * 0.55
      pDecay[i] = i === n - 1 ? 0.16 + Math.random() * 0.12 : 0.05 + Math.random() * 0.04
      t += 0.07 + Math.random() * 0.12
    }
    nPulses.current = n
    flashT0.current = performance.now() / 1000
    playThunder(d)
  }

  useEffect(() => {
    if (FX_OFF) return
    weather.triggerFlash = (d) => trigger.current(d)

    const applyMap = (id) => {
      const m = getMap(id)
      dims.current.hw = m.CABIN_HW ?? m.HW ?? 9
      dims.current.hd = m.CABIN_HD ?? m.HD ?? 10
    }
    applyMap(useGameStore.getState().mapId)

    // Rain runs for the whole game session (not on menu / death screens).
    const inGame = (p) => p === 'playing' || p === 'intermission' || p === 'wave_clear'
    let raining = false
    const syncRain = (s) => {
      const want = inGame(s.phase)
      if (want && !raining) { startRain(); indoor.current = null }
      else if (!want && raining) stopRain()
      raining = want
    }
    syncRain(useGameStore.getState())

    // Boss arrival: slam a close strike + trigger the interior blackout.
    let lastBossId = -1
    const unsub = useGameStore.subscribe((s, prev) => {
      syncRain(s)
      if (s.mapId !== prev.mapId) applyMap(s.mapId)
      if (s.zombies === prev.zombies) return
      const zs = s.zombies
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i]
        if (z.bossEntrance && z.id !== lastBossId) {
          lastBossId = z.id
          weather.bossAt = performance.now() / 1000
          trigger.current(0.05)
          nextIn.current = 25
          break
        }
      }
    })

    if (FX_DEBUG) {
      window.__fx = {
        flash: (d) => trigger.current(d ?? 0.1),
        boss: () => { weather.bossAt = performance.now() / 1000; trigger.current(0.05) },
        // Hold the flash at a fixed level (for screenshots); null releases it.
        hold: (v) => { weather.hold = v },
        weather,
        store: useGameStore,
      }
    }
    return () => {
      unsub()
      if (raining) stopRain()
      weather.triggerFlash = null
    }
  }, [])

  useFrame((state, rawDelta) => {
    if (FX_DEBUG) window.__three = state
    if (FX_OFF) return
    const delta = Math.min(rawDelta, 0.05)

    // Resolve the lights once (and again if the map swapped them out).
    if (!moon.current || !moon.current.parent || !hemi.current || !hemi.current.parent) {
      moon.current = null
      hemi.current = null
      scene.traverse((o) => {
        if (!moon.current && o.isDirectionalLight) moon.current = o
        else if (!hemi.current && o.isHemisphereLight) hemi.current = o
        else if (o.isAmbientLight && !lightReg.amb) extras.current.push(o)
      })
      for (const o of extras.current) o.userData.baseI = o.intensity
      if (moon.current) moon.current.userData.baseI = moon.current.intensity
      if (hemi.current) hemi.current.userData.baseI = hemi.current.intensity
    }

    const gs = useGameStore.getState()
    const phase = gs.phase

    // Schedule the next strike (real time, so slow-mo doesn't stretch the sky).
    if (phase === 'playing' || phase === 'intermission') {
      nextIn.current -= Math.min(delta, 0.1)
      if (nextIn.current <= 0) {
        const g = phase === 'playing' ? GAP_PLAYING : GAP_INTERMISSION
        nextIn.current = g[0] + Math.random() * (g[1] - g[0])
        trigger.current()
      }
    }

    // Indoor / outdoor rain mix.
    const p = state.camera.position
    const isIn = Math.abs(p.x) < dims.current.hw - 0.3 && Math.abs(p.z) < dims.current.hd - 0.3
    if (isIn !== indoor.current) { indoor.current = isIn; setRainIndoor(isIn) }

    // Flash envelope = max of the exponential pulses.
    const t = performance.now() / 1000 - flashT0.current
    let f = 0
    for (let i = 0; i < nPulses.current; i++) {
      const dt = t - pStart[i]
      if (dt >= 0) {
        const v = pAmp[i] * Math.exp(-dt / pDecay[i])
        if (v > f) f = v
      }
    }
    if (weather.hold != null) f = weather.hold
    weather.flash = f

    // Blackout modifier: moonlight / hemisphere / ambient fill scale by modFx.ambMul (lightning still cuts through).
    const amb = modFx.ambMul
    if (f > 0.002 || wasFlashing.current || amb !== lastAmbMul.current) {
      wasFlashing.current = f > 0.002
      lastAmbMul.current = amb
      const m = moon.current
      const h = hemi.current
      if (m) m.intensity = m.userData.baseI * amb + f * MOON_BOOST
      if (h) h.intensity = h.userData.baseI * amb + f * HEMI_BOOST
      for (const o of extras.current) o.intensity = o.userData.baseI * amb
      const sky = weather.skyMat
      if (sky) sky.color.setRGB(1 + f * SKY_BOOST_R, 1 + f * SKY_BOOST_G, 1 + f * SKY_BOOST_B)
    }
  })

  return null
}
