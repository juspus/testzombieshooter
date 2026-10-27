// Shared storm / boss-blackout state. Plain mutable module state so the
// single per-frame loops (Storm, LivingLights) can read it with zero allocs.

export const weather = {
  flash: 0,           // 0..1 current lightning intensity (written by Storm)
  bossAt: -1e9,       // performance.now()/1000 when the boss last arrived
  skyMat: null,       // sky meshBasicMaterial (registered by the skybox)
  hold: null,         // dev: pin flash level (screenshots)
  triggerFlash: null, // set by Storm: (distance?: 0..1) => void
}

export function registerSkyMaterial(mat) { weather.skyMat = mat }

// Dev/preview only (same gate as the ?wave= debug params).
export const FX_DEBUG = typeof window !== 'undefined' &&
  import.meta.env.VITE_VERCEL_ENV !== 'production'

// Dev/preview only: ?nofx disables Storm + LivingLights so perf can be A/B'd.
export const FX_OFF = FX_DEBUG && new URLSearchParams(window.location.search).has('nofx')
