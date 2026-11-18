// Scene effects and viewmodel animations that gameplay code triggers but a component owns (bullet
// trails, shell casings, blood, bolts, grenades, the gun and knife animations, the flame spray).
// Each channel is an object of no-op functions. A component registers its implementation in an
// effect (useLayoutEffect) with `registerFx(channel, impl)` and the returned cleanup puts the no-ops
// back, so a remount or a hot reload never leaves a stale function behind, and a call made while
// nothing is mounted does nothing (the old `Component.fn?.()` behaviour). Callers import the channel
// they need from here, never a component: `import { trails } from './fxBus'`.
// No React, no three: pure module state, so it runs in tests.
const noop = () => {}

export const trails = { add: noop }                                  // (start, end)
export const shells = { eject: noop }                                // (origin, right)
export const flameSpray = { spray: noop }                            // (origin, dir, count)
export const blood = { spawn: noop }                                 // (point, dir, intensity, pellet)
export const bolts = { fire: noop }                                  // (from, to, opts)
export const grenades = { throw: noop }                              // (data)
// Viewmodel: Gun.jsx and Knife.jsx animate from these. getMuzzlePosition returns undefined while
// the gun is not mounted (callers fall back to the camera).
export const gun = { fire: noop, pump: noop, setFlameActive: noop, getMuzzlePosition: noop }
export const knife = { swing: noop }

// registerFx(gun, { fire, pump }) -> cleanup. The cleanup only resets a member that still holds the
// function this call installed, so a newer registration (StrictMode double effect, two instances)
// is never wiped by an older cleanup.
export function registerFx(channel, impl) {
  const keys = Object.keys(impl)
  for (const k of keys) channel[k] = impl[k]
  return () => { for (const k of keys) if (channel[k] === impl[k]) channel[k] = noop }
}
