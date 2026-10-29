import { describe, it, expect, beforeAll } from 'vitest'

// Minimal Web Audio fake: records the graph so we can check which bus each sound lands on.
class Param {
  constructor(v = 0) { this.value = v; this.target = v }
  setValueAtTime(v) { this.value = v; this.target = v }
  linearRampToValueAtTime(v) { this.target = v }
  exponentialRampToValueAtTime(v) { this.target = v }
  setTargetAtTime(v) { this.target = v }
  cancelScheduledValues() {}
}
class Node {
  constructor(kind) { this.kind = kind; this.out = [] }
  connect(n) { this.out.push(n); return n }
  disconnect() { this.out = [] }
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = new Node('speakers'); FakeCtx.last = this }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
  createGain() { const n = new Node('gain'); n.gain = new Param(1); return n }
  createOscillator() { const n = new Node('osc'); n.frequency = new Param(); n.start = () => {}; n.stop = () => {}; return n }
  createBiquadFilter() { const n = new Node('filter'); n.frequency = new Param(); n.Q = new Param(); return n }
  createBufferSource() { const n = new Node('src'); n.start = () => {}; n.stop = () => {}; return n }
  createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) } }
}

// Every node reachable downstream of `n`.
function downstream(n, seen = new Set()) {
  for (const o of n.out) if (!seen.has(o)) { seen.add(o); downstream(o, seen) }
  return seen
}

let sounds, settings, ac
beforeAll(async () => {
  window.AudioContext = FakeCtx
  try { localStorage.clear() } catch { /* ignore */ }
  settings = await import('../settings')
  sounds = await import('../sounds')
  ac = sounds.getAudioContext()
})

describe('volume buses', () => {
  it('square curve, clamped', () => {
    expect(sounds.volumeCurve(1)).toBe(1)
    expect(sounds.volumeCurve(0.5)).toBe(0.25)
    expect(sounds.volumeCurve(-1)).toBe(0)
    expect(sounds.volumeCurve(3)).toBe(1)
  })

  it('effects and music sit on separate buses, both reach the speakers', () => {
    const sfxBus = ac.destination   // shadowed: what every effect connects to
    expect(sfxBus.kind).toBe('gain')
    expect(reachesSpeakers(sfxBus)).toBe(true)

    // startEerieMusic's first gain is the whole calm layer; it feeds the music bus.
    const gains = []
    const orig = FakeCtx.prototype.createGain
    FakeCtx.prototype.createGain = function () { const g = orig.call(this); gains.push(g); return g }
    sounds.startEerieMusic()
    FakeCtx.prototype.createGain = orig
    musicBus = gains[0].out[0]
    sounds.stopEerieMusic()

    expect(musicBus).not.toBe(sfxBus)
    expect(downstream(musicBus).has(sfxBus)).toBe(false)
    expect(reachesSpeakers(musicBus)).toBe(true)
  })

  it('settings changes move the matching bus', () => {
    const set = settings.useSettings.getState().setSetting
    set('musicVolume', 0.5)
    expect(musicBus.gain.target).toBe(0.25)
    set('sfxVolume', 0)
    expect(ac.destination.gain.target).toBe(0)
    expect(musicBus.gain.target).toBe(0.25)
    set('sfxVolume', 1)
    expect(ac.destination.gain.target).toBe(1)
  })
})

let musicBus = null
const reachesSpeakers = (n) => [...downstream(n)].some((o) => o.kind === 'speakers')
