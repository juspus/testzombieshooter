// Automatic frame governor: a pure state machine fed with raw frame times (ms).
// No DOM, no three.js, no timers; the caller applies the level (see FrameGovernor.jsx).
//
// Keeps a time-based EMA of frame time. When the average stays above DOWN_MS for
// DOWN_HOLD_S it steps one level down (cheaper); when it stays below UP_MS for
// UP_HOLD_S it steps one level back up. Hysteresis comes from the gap between the two
// thresholds, a cooldown after every step, and a back-off: if a step up is followed by
// a step down within flapS, the next step up waits twice as long (up to 8x).
//
// Levels never touch the light count or materials, only the lo-fi internal height
// and how often the shadow map is re-rendered.

export const GOV_LEVELS = [
  { height: 400, shadowEvery: 1 },   // 0: the normal look
  { height: 340, shadowEvery: 1 },   // 1
  { height: 288, shadowEvery: 1 },   // 2
  { height: 288, shadowEvery: 2 },   // 3: shadow map refreshed every 2nd frame
]
export const GOV_MAX_LEVEL = GOV_LEVELS.length - 1

export const GOV_DEFAULTS = {
  downMs: 22,       // EMA above this ...
  downHoldS: 2,     // ... for this long steps down
  upMs: 17.5,       // EMA below this (a vsync-locked 60 Hz frame is 16.7 ms, so 14 could never be reached) ...
  upHoldS: 6,       // ... for this long steps up
  cooldownS: 3,     // minimum time between any two steps
  tauS: 0.5,        // EMA time constant
  warmupS: 2,       // ignore the first frames (shader compile, texture upload)
  maxFrameMs: 250,  // a longer frame is clamped to this before averaging
  skipFrameMs: 1000, // a longer frame is a tab switch / suspend: not counted at all
  flapS: 12,        // step down this soon after a step up = flapping, back off
  maxBackoff: 8,
}

export function createGovernor(opts = {}) {
  const c = { ...GOV_DEFAULTS, ...opts }
  const g = {
    level: 0,
    ema: 0,            // ms
    clock: 0,          // seconds of counted frame time
    highFor: 0,
    lowFor: 0,
    lastStepAt: -Infinity,
    lastUpAt: -Infinity,
    backoff: 1,
    steps: 0,
  }

  // Feed one frame (ms). Returns +1 / -1 when the level changed this frame (+1 = cheaper), else 0.
  function update(frameMs) {
    if (!(frameMs > 0) || frameMs > c.skipFrameMs) return 0
    const dtS = Math.min(frameMs, c.maxFrameMs) / 1000
    const ms = Math.min(frameMs, c.maxFrameMs)
    g.clock += dtS
    if (g.clock < c.warmupS) return 0

    if (g.ema === 0) g.ema = ms
    else g.ema += (ms - g.ema) * (1 - Math.exp(-dtS / c.tauS))

    if (g.ema > c.downMs) { g.highFor += dtS; g.lowFor = 0 }
    else if (g.ema < c.upMs) { g.lowFor += dtS; g.highFor = 0 }
    else { g.highFor = 0; g.lowFor = 0 }

    if (g.clock - g.lastStepAt < c.cooldownS) return 0

    if (g.highFor >= c.downHoldS && g.level < GOV_MAX_LEVEL) {
      if (g.clock - g.lastUpAt < c.flapS) g.backoff = Math.min(c.maxBackoff, g.backoff * 2)
      g.level++
      return step(+1)
    }
    if (g.lowFor >= c.upHoldS * g.backoff && g.level > 0) {
      g.level--
      g.lastUpAt = g.clock
      return step(-1)
    }
    // Long stable stretch at level 0 forgives old flapping.
    if (g.level === 0 && g.lowFor >= c.upHoldS * 4) g.backoff = 1
    return 0
  }

  function step(dir) {
    g.lastStepAt = g.clock
    g.highFor = 0
    g.lowFor = 0
    g.steps++
    return dir
  }

  return {
    update,
    get level() { return g.level },
    get ema() { return g.ema },
    get backoff() { return g.backoff },
    get steps() { return g.steps },
    settings: () => GOV_LEVELS[g.level],
    reset() { g.level = 0; g.ema = 0; g.clock = 0; g.highFor = 0; g.lowFor = 0; g.lastStepAt = -Infinity; g.lastUpAt = -Infinity; g.backoff = 1; g.steps = 0 },
  }
}

// Shared read-only snapshot for the ?perf overlay (written by FrameGovernor.jsx).
export const govInfo = { enabled: false, level: 0, ema: 0 }
