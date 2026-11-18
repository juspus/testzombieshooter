import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Guards the sounds.js split (docs/next-roadmap.html t-split-files): the export list of sounds.js
// (name, kind, arity) and the audio bus wiring from CLAUDE.md "Audio buses":
//   ac.destination is shadowed to return the EFFECTS bus; music connects to the music bus; the
//   heartbeat and stings use the dry effects bus; all three sit before the master. There is exactly
//   ONE AudioContext. The fixture was captured from the single-file sounds.js before the split.
// Regenerate on purpose only:
//   UPDATE_SOUNDS_SHAPE=1 npx vitest run src/__tests__/sounds.shape.test.js
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sounds.shape.json')

// Web Audio fake that records the graph so each sound can be traced to its bus.
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
let made = []   // nodes created since the last reset
class FakeCtx {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000
    this.destination = new Node('speakers')
    this.listener = new Proxy({}, { get: (t, k) => (t[k] ??= new Param()) })
    FakeCtx.count++
  }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
  _n(kind, extra = {}) { const n = new Node(kind); Object.assign(n, extra); made.push(n); return n }
  createGain() { return this._n('gain', { gain: new Param(1) }) }
  createOscillator() { return this._n('osc', { frequency: new Param(), detune: new Param(), start() {}, stop() {} }) }
  createBiquadFilter() { return this._n('filter', { frequency: new Param(), Q: new Param(), gain: new Param() }) }
  createBufferSource() { return this._n('src', { playbackRate: new Param(1), start() {}, stop() {} }) }
  createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len), length: len } }
  createWaveShaper() { return this._n('shaper') }
  createDynamicsCompressor() { return this._n('comp', { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }) }
  createPanner() { return this._n('panner', { positionX: new Param(), positionY: new Param(), positionZ: new Param() }) }
}
FakeCtx.count = 0

const downstream = (n, seen = new Set()) => {
  for (const o of n.out ?? []) if (!seen.has(o)) { seen.add(o); downstream(o, seen) }
  return seen
}

let sounds, settings, ac, sfx, bus
beforeAll(async () => {
  window.AudioContext = FakeCtx
  try { localStorage.clear() } catch { /* ignore */ }
  settings = await import('../settings')
  sounds = await import('../sounds')
  made = []
  ac = sounds.getAudioContext()   // first call builds the context and the buses
  sfx = ac.destination            // the shadowed property: the effects bus
  const gains = made.filter((n) => n.kind === 'gain')
  const lp = made.find((n) => n.kind === 'filter')
  const master = gains.find((g) => g.out.some((o) => o.kind === 'speakers'))
  bus = {
    lp, master,
    dry: gains.find((g) => g !== sfx && g.out[0] === master),
    music: gains.find((g) => g !== sfx && g !== master && g.out[0] === lp),
  }
})
afterEach(() => { made = [] })

function plain(v) {
  if (typeof v === 'function') return { kind: 'function', arity: v.length }
  return { kind: typeof v, value: v }
}

describe('sounds export list (survives the split)', () => {
  it('exports the same names, kinds and arities', async () => {
    const mod = await import('../sounds')
    const now = {}
    for (const k of Object.keys(mod).sort()) now[k] = plain(mod[k])
    if (process.env.UPDATE_SOUNDS_SHAPE) fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n')
    expect(now).toEqual(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')))
  })
  it('volumeCurve is the clamped square curve', () => {
    expect([0, 0.5, 1, -1, 3].map(sounds.volumeCurve)).toEqual([0, 0.25, 1, 0, 1])
  })
})

// Does anything the call built end up on `target`?
function reaches(nodes, target) {
  return nodes.some((n) => n === target || downstream(n).has(target))
}

describe('audio bus wiring (CLAUDE.md "Audio buses")', () => {
  it('shadows ac.destination with the effects bus: sfx -> lowpass -> master -> speakers', () => {
    expect(sfx.kind).toBe('gain')
    expect(sfx.out).toEqual([bus.lp])
    expect(bus.lp.out).toEqual([bus.master])
    expect(bus.master.out.map((n) => n.kind)).toEqual(['speakers'])
  })

  it('the music bus feeds the lowpass; the dry bus bypasses it; none is the effects bus', () => {
    expect(bus.music).toBeTruthy()
    expect(bus.dry).toBeTruthy()
    expect(new Set([sfx, bus.music, bus.dry, bus.master]).size).toBe(4)
    expect(bus.music.out).toEqual([bus.lp])
    expect(bus.dry.out).toEqual([bus.master])
    expect(downstream(bus.dry).has(bus.lp)).toBe(false)
  })

  it('routes each effect to the effects bus, never the music bus', () => {
    const cases = [
      ['gunshot (pistol)', () => sounds.playGunshot('pistol')],
      ['gunshot (shotgun, upgraded)', () => sounds.playGunshot('shotgun', true)],
      ['gunshot (ak47)', () => sounds.playGunshot('ak47')],
      ['crossbow', () => sounds.playGunshot('crossbow')],
      ['reload', () => sounds.playReload()],
      ['empty click', () => sounds.playEmptyClick()],
      ['zombie death and groan (positional)', () => { sounds.playZombieDie(1, 1, 1); sounds.playZombieGroan(2, 1, 2, 1, 0) }],
      ['zombie footstep', () => sounds.playZombieFootstep(3, 0, 3)],
      ['spider shriek', () => sounds.playSpiderShriek(1, 2, 1)],
      ['remote gunshot', () => sounds.playRemoteGunshot('pistol', 1, 1, 1)],
      ['thunder', () => sounds.playThunder(0.5)],
      ['powerup drop', () => sounds.playPowerupDrop()],
      ['door', () => sounds.playDoorOpen(1, 1, 1)],
      ['volume preview (effects)', () => { sounds.playVolumePreview('sfx') }],
    ]
    for (const [name, fn] of cases) {
      made = []
      fn()
      const nodes = [...made]
      expect(nodes.length, name).toBeGreaterThan(0)
      expect(reaches(nodes, sfx), name).toBe(true)
      expect(reaches(nodes, bus.music), name).toBe(false)
    }
  })

  it('music routes to the music bus, never directly to the effects bus', () => {
    made = []
    sounds.startEerieMusic()
    sounds.setMusicIntensity(1)
    const nodes = [...made]
    expect(reaches(nodes, bus.music)).toBe(true)
    expect(nodes.filter((n) => n.out.includes(sfx))).toEqual([])
    sounds.setMusicIntensity(0)
    sounds.stopEerieMusic()
  })

  it('the music volume preview lands on the music bus', () => {
    const real = performance.now()
    const spy = vi.spyOn(performance, 'now').mockReturnValue(real + 5000)   // past the preview rate limit
    made = []
    sounds.playVolumePreview('music')
    spy.mockRestore()
    expect(reaches([...made], bus.music)).toBe(true)
  })

  it('heartbeat and stings use the dry bus (no muffle), not the effects bus', () => {
    made = []
    sounds.startHeartbeat(0.5)
    sounds.stopHeartbeat()
    sounds.playLastKillSting()
    sounds.playPowerupPickup('nuke')
    expect(made.some((n) => n.out.includes(bus.dry))).toBe(true)
    expect(made.some((n) => n.out.includes(sfx))).toBe(false)
  })

  it('the muffle moves the master lowpass (low HP and slow-mo, the louder wins)', () => {
    const f = () => bus.lp.frequency.target
    sounds.setDangerMuffle(1)
    expect(f()).toBeCloseTo(700, 0)
    sounds.setDangerMuffle(0)
    sounds.setSlowMoMuffle(0.5)
    expect(f()).toBeGreaterThan(700)
    expect(f()).toBeLessThan(22000)
    sounds.setSlowMoMuffle(0)
    expect(f()).toBeGreaterThan(20000)
  })

  it('volume sliders move the matching bus', () => {
    const set = settings.useSettings.getState().setSetting
    set('sfxVolume', 0.5)
    expect(sfx.gain.target).toBe(0.25)
    expect(bus.dry.gain.target).toBe(0.25)
    set('musicVolume', 0.5)
    expect(bus.music.gain.target).toBe(0.25)
    expect(sfx.gain.target).toBe(0.25)
    set('volume', 0.5)
    expect(bus.master.gain.target).toBe(0.25)
    set('sfxVolume', 1); set('musicVolume', 1); set('volume', 1)
  })

  it('there is exactly one AudioContext', () => {
    expect(sounds.getAudioContext()).toBe(ac)
    expect(FakeCtx.count).toBe(1)
  })
})
