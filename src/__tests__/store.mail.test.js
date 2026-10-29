import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore, mailClock } from '../store'

const st = () => useGameStore.getState()
const live = () => st().zombies.filter((z) => !z.dying)

function startMatch(seed = 'mailtest') {
  st().startVersusRun('mail', seed)
  st().skipIntermission()
  st().tick(0.1)
  expect(st().phase).toBe('playing')
}
// Land everything queued (the mail clock only runs while playing).
const flush = () => { for (let i = 0; i < 40 && st().mail.incoming.length; i++) st().mailTick(1) }

describe('zombie mail store', () => {
  afterEach(() => { useGameStore.setState({ instaKillOn: false, lastKillPending: false }); st().startGame() })

  it('resets on every run start', () => {
    startMatch()
    useGameStore.setState({ mail: { ...st().mail, meter: 9, sent: [{ id: 'm1', item: 'brute' }] } })
    st().startVersusRun('mail', 'again')
    expect(st().mail).toMatchObject({ meter: 0, sent: [], incoming: [], waveExtra: 0, pendingModifier: null })
  })

  it('awards meter on kills in a versus run: 1, headshot 1.5, knife 2', () => {
    startMatch()
    const ids = live().slice(0, 4).map((z) => z.id)
    useGameStore.setState({ instaKillOn: true })
    st().hitZombie(ids[0], false)
    expect(st().mail.meter).toBe(1)
    st().hitZombie(ids[1], true)
    expect(st().mail.meter).toBe(2.5)
    st().hitZombie(ids[2], false, 'knife')
    expect(st().mail.meter).toBe(4.5)
  })

  it('does not award meter outside versus', () => {
    st().startGame()
    st().skipIntermission(); st().tick(0.1)
    st().hitZombie(live()[0].id, true, 'gun', null, Infinity, 99)
    expect(st().mail.meter).toBe(0)
  })

  it('caps the meter at 30', () => {
    startMatch()
    useGameStore.setState({ mail: { ...st().mail, meter: 29.5 } })
    st().hitZombie(live()[0].id, true, 'gun', null, Infinity, 99)
    expect(st().mail.meter).toBe(30)
  })

  it('spendMail pays, numbers the mail and refuses when broke or finished', () => {
    startMatch()
    expect(st().spendMail('brute')).toBe(null)
    useGameStore.setState({ mail: { ...st().mail, meter: 20 } })
    expect(st().spendMail('horde')).toBe('m1')
    expect(st().mail.meter).toBe(8)
    expect(st().mail.sent).toEqual([{ id: 'm1', item: 'horde' }])
    expect(st().spendMail('exploders')).toBe('m2')
    expect(st().mail.meter).toBe(0)
    useGameStore.setState({ mail: { ...st().mail, meter: 20 } })
    st().finishVersus('win', 'forfeit')
    expect(st().spendMail('brute')).toBe(null)
  })

  it('refuses to spend while dead', () => {
    startMatch()
    useGameStore.setState({ mail: { ...st().mail, meter: 20 } })
    st().die()
    expect(st().spendMail('brute')).toBe(null)
  })

  it('receive while playing: warning first, then the right zombies land and the HUD total grows', () => {
    startMatch()
    const before = st().zombies.length + st().pendingSpawns.length
    const total = st().getZombiesForWave()
    expect(st().receiveMail({ id: 'r1', item: 'exploders' })).toBe(true)
    expect(st().mail.incoming).toHaveLength(1)
    expect(st().mail.incoming[0].edge).toMatch(/^[NSEW]$/)
    st().mailTick(2)
    expect(st().zombies.length + st().pendingSpawns.length).toBe(before)   // still inside the 5 s warning
    st().mailTick(3.1)
    const all = [...st().zombies, ...st().pendingSpawns].filter((z) => z.mail === 'r1')
    expect(all.map((z) => z.type)).toEqual(['exploder', 'exploder', 'exploder'])
    expect(st().getZombiesForWave()).toBe(total + 3)
    expect(st().mail.incoming).toHaveLength(0)
    const ids = [...st().zombies, ...st().pendingSpawns].map((z) => z.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lands each item as the right archetypes', () => {
    startMatch()
    for (const [item, type, n] of [['brute', 'brute', 1], ['spitters', 'spitter', 2], ['horde', 'runner', 8]]) {
      st().receiveMail({ id: `x-${item}`, item })
      flush()
      const got = [...st().zombies, ...st().pendingSpawns].filter((z) => z.mail === `x-${item}`)
      expect(got).toHaveLength(n)
      expect(got.every((z) => z.type === type)).toBe(true)
    }
  })

  it('spaces deliveries 4 s apart', () => {
    startMatch()
    st().receiveMail({ id: 'a', item: 'brute' })
    st().receiveMail({ id: 'b', item: 'brute' })
    st().mailTick(5)
    expect(st().mail.incoming).toHaveLength(1)
    st().mailTick(3.5)
    expect(st().mail.incoming).toHaveLength(1)
    st().mailTick(0.6)
    expect(st().mail.incoming).toHaveLength(0)
  })

  it('overflow beyond 25 active goes to pendingSpawns', () => {
    startMatch()
    const need = 25 - live().length
    useGameStore.setState({
      zombies: [...st().zombies, ...Array.from({ length: Math.max(0, need - 3) }, (_, i) => ({ id: 9000 + i, x: 0, z: 0, health: 2, maxHealth: 2, type: 'walker' }))],
    })
    expect(live().length).toBe(22)
    st().receiveMail({ id: 'h', item: 'horde' })
    flush()
    expect(live().length).toBe(25)
    expect(st().pendingSpawns.filter((z) => z.mail === 'h')).toHaveLength(5)
  })

  it('mail zombies count toward the wave: killing them all clears it', () => {
    startMatch()
    st().receiveMail({ id: 'k', item: 'brute' })
    flush()
    expect(st().waveKills).toBe(0)
    useGameStore.setState({ instaKillOn: true })
    for (let i = 0; i < 40 && (live().length || st().pendingSpawns.length); i++) st().hitZombie(live()[0].id, false)
    expect(st().waveKills).toBe(st().getZombiesForWave())
  })

  it('holds a zombie delivery until the next wave plays', () => {
    startMatch()
    useGameStore.setState({ zombies: [], pendingSpawns: [], phase: 'wave_clear' })
    st().receiveMail({ id: 'w', item: 'brute' })
    st().nextWave()
    expect(st().phase).toBe('intermission')
    expect(st().mail.incoming).toHaveLength(1)
    st().tick(0.5)   // intermission ticks never touch the mail clock
    expect(st().zombies.filter((z) => z.mail === 'w')).toHaveLength(0)
    st().skipIntermission(); st().tick(0.1)
    expect(st().phase).toBe('playing')
    expect(st().mail.waveExtra).toBe(0)
    st().tick(2)
    expect(st().mail.incoming).toHaveLength(1)   // warning window again after the wave starts
    st().tick(3.5)
    expect(st().zombies.filter((z) => z.mail === 'w')).toHaveLength(1)
    expect(st().mail.incoming).toHaveLength(0)
    expect(st().mail.waveExtra).toBe(1)
  })

  it('does not land while the last kill is pending', () => {
    startMatch()
    st().receiveMail({ id: 'p', item: 'brute' })
    useGameStore.setState({ lastKillPending: true })
    st().mailTick(30)
    expect(st().mail.incoming).toHaveLength(1)
  })

  it('blackout in intermission re-rolls the wave about to start', () => {
    st().startVersusRun('mail', 'bo')
    expect(st().phase).toBe('intermission')
    st().receiveMail({ id: 'b1', item: 'blackout' })
    expect(st().waveModifier).toBe('blackout')
    expect(st().mail.incoming).toHaveLength(0)
  })

  it('blackout while playing forces the NEXT wave via nextWave, once', () => {
    startMatch()
    st().receiveMail({ id: 'b2', item: 'blackout' })
    expect(st().waveModifier).toBe(null)
    flush()
    expect(st().mail.pendingModifier).toBe('blackout')
    useGameStore.setState({ zombies: [], pendingSpawns: [], phase: 'wave_clear' })
    st().nextWave()
    expect(st().waveModifier).toBe('blackout')
    expect(st().wave).toBe(2)
    expect(st().mail.pendingModifier).toBe(null)
    useGameStore.setState({ phase: 'wave_clear' })
    st().nextWave()
    expect(st().waveModifier).not.toBe('blackout')   // consumed once (wave 3 never rolls a modifier)
  })

  it('blackout in wave_clear is picked up by the following nextWave', () => {
    startMatch()
    useGameStore.setState({ zombies: [], pendingSpawns: [], phase: 'wave_clear' })
    st().receiveMail({ id: 'b3', item: 'blackout' })
    st().nextWave()
    expect(st().waveModifier).toBe('blackout')
  })

  it('ignores duplicates, unknown items, bad ids and finished matches', () => {
    startMatch()
    expect(st().receiveMail({ id: 'd', item: 'brute' })).toBe(true)
    expect(st().receiveMail({ id: 'd', item: 'brute' })).toBe(false)
    expect(st().receiveMail({ id: 'e', item: 'tank' })).toBe(false)
    expect(st().receiveMail({ id: 5, item: 'brute' })).toBe(false)
    st().finishVersus('lose', 'death')
    expect(st().receiveMail({ id: 'f', item: 'brute' })).toBe(false)
  })

  it('ignores mail outside a versus run', () => {
    st().startGame()
    expect(st().receiveMail({ id: 'n', item: 'brute' })).toBe(false)
  })

  it('does not disturb the seeded wave stream', () => {
    const wave2 = () => {
      useGameStore.setState({ zombies: [], pendingSpawns: [], phase: 'wave_clear' })
      st().nextWave()
      st().skipIntermission(); st().tick(0.1)
      return st().zombies.map((z) => [z.type, Math.round(z.x * 100), Math.round(z.z * 100)])
    }
    startMatch('stream')
    st().receiveMail({ id: 'z', item: 'horde' })
    flush()
    const withMail = wave2()
    startMatch('stream')
    expect(wave2()).toEqual(withMail)
  })
})

describe('mail clock', () => {
  it('is reset by a new run', () => {
    mailClock.t = 99
    useGameStore.getState().startGame()
    expect(mailClock.t).toBe(0)
  })
})
