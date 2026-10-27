// Run RNG. Gameplay code draws from runRandom()/waveRandom()/keyedRandom(); cosmetic
// randomness (particles, sounds, groans, camera shake) stays on Math.random so it can
// never desync a seeded run. Outside Daily Run mode everything falls through to
// Math.random (looked up per call, so the ?bench Math.random override still works).

let _seed = null          // null = normal run (Math.random)
const _streams = new Map() // name -> rng fn, one persistent stream per gameplay concern

// FNV-1a over a string -> uint32
export function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32: tiny, fast, good enough for gameplay rolls
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const isSeeded = () => _seed !== null
export const currentSeed = () => _seed

/** Seed (string, e.g. '2026-10-27') all run streams; resets every stream. */
export function startSeededRun(seed) {
  _seed = String(seed)
  _streams.clear()
}

/** Back to Math.random everywhere. */
export function endSeededRun() {
  _seed = null
  _streams.clear()
}

const mathRandom = () => Math.random()

/** Persistent per-concern stream ('drop', 'box', 'pickup', 'ai', ...). */
export function runRandom(stream = 'main') {
  if (_seed === null) return mathRandom
  let r = _streams.get(stream)
  if (!r) { r = mulberry32(hashString(`${_seed}|${stream}`)); _streams.set(stream, r) }
  return r
}

/** Fresh stream for (concern, wave): wave N's spawns don't depend on how waves 1..N-1 played out. */
export function waveRandom(stream, wave) {
  if (_seed === null) return mathRandom
  return mulberry32(hashString(`${_seed}|${stream}|w${wave}`))
}

/** One float keyed by (concern, key) - e.g. per-zombie-id rolls that must not depend on mount order. */
export function keyedRandom(stream, key) {
  if (_seed === null) return Math.random()
  return mulberry32(hashString(`${_seed}|${stream}|k${key}`))()
}
