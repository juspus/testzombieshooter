import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import { useGameStore } from '../store'
import { DIRECTOR, waveBudget } from '../director'

const st = () => useGameStore.getState()
const d = () => st().director
const live = () => st().zombies.filter((z) => !z.dying)

// Host defends round 1. Skips straight into the playing phase of wave 1 when `play`.
function start(side = 'host', play = true) {
  st().startVersusRun('director', 'dirtest', side)
  if (play) openWave()
}
function openWave() {
  st().tick(DIRECTOR.INTERMISSION_S + 0.1)
  expect(st().phase).toBe('playing')
}
let n = 0
const spawn = (type, cluster = 0, id = `s${++n}`) => st().directorSpawn({ id, type, cluster })
const killAll = () => { useGameStore.setState({ instaKillOn: true }); for (const z of live()) st().hitZombie(z.id, false); useGameStore.setState({ instaKillOn: false }) }

describe('director store', () => {
  afterEach(() => { vi.useRealTimers(); useGameStore.setState({ instaKillOn: false, lastKillPending: false, paused: false }); st().startGame() })

  it('starts: host defends round 1, guest directs and is frozen', () => {
    start('host', false)
    expect(d()).toMatchObject({ active: true, role: 'defender', round: 1, defender: 'host', stage: 'turn', budget: waveBudget(1) })
    expect(st().paused).toBe(false)
    expect(st().intermissionLeft).toBe(DIRECTOR.INTERMISSION_S)
    start('guest', false)
    expect(d()).toMatchObject({ role: 'director', defender: 'host' })
    expect(st().paused).toBe(true)
    expect(st().zombies).toEqual([])
  })

  it('a wave spawns nothing by itself and the window is open', () => {
    start()
    expect(st().zombies).toEqual([])
    expect(d().windowLeft).toBe(DIRECTOR.SPAWN_WINDOW_S)
    expect(st().pendingSpawns).toEqual([])
  })

  it('spawn: pays the cost, lands at the cluster, dedupes by id', () => {
    start()
    st().tick(DIRECTOR.INTERMISSION_S) // no-op in playing, keeps clock honest
    useGameStore.setState({ wave: 4 })
    const b = d().budget
    expect(spawn('brute', 0, 'a')).toBe('ok')
    expect(d().budget).toBe(b - 4)
    expect(live()).toHaveLength(1)
    expect(live()[0]).toMatchObject({ type: 'brute', health: 7 })
    expect(Math.max(Math.abs(live()[0].x), Math.abs(live()[0].z))).toBeGreaterThan(15)   // at a treeline cluster (a sealed one remaps to the nearest active)
    expect(spawn('brute', 0, 'a')).toBe('dup')
    expect(d().budget).toBe(b - 4)
    expect(live()).toHaveLength(1)
  })

  it('rejects locked and unaffordable units, bad clusters and bad ids', () => {
    start()
    expect(spawn('brute')).toBe('rejected')              // unlocks on wave 4
    expect(spawn('walker', 99)).toBe('bad')
    expect(st().directorSpawn({ id: '', type: 'walker', cluster: 0 })).toBe('bad')
    expect(st().directorSpawn({ id: 'x', type: 'nope', cluster: 0 })).toBe('rejected')
    useGameStore.setState({ director: { ...d(), budget: 0 } })
    expect(spawn('walker')).toBe('rejected')
    expect(live()).toHaveLength(0)
  })

  it('pre-placed spawns in the intermission land when the wave starts', () => {
    start('host', false)
    expect(spawn('walker', 0, 'p1')).toBe('ok')
    expect(spawn('walker', 0, 'p1')).toBe('dup')
    expect(st().zombies).toHaveLength(0)
    expect(d().budget).toBe(waveBudget(1) - 1)
    openWave()
    expect(live()).toHaveLength(1)
    expect(d().windowLeft).toBe(DIRECTOR.SPAWN_WINDOW_S)
  })

  it('caps active zombies at 25 and queues the overflow', () => {
    start()
    useGameStore.setState({ director: { ...d(), budget: 40 } })
    for (let i = 0; i < 30; i++) spawn('walker', i % 6)
    expect(live()).toHaveLength(25)
    expect(st().pendingSpawns).toHaveLength(5)
  })

  it('autoFill spends the leftover as walkers when the window ends', () => {
    start()
    spawn('runner', 0, 'r')   // locked on wave 1 -> rejected
    spawn('walker', 1, 'w')
    const left = d().budget
    st().tick(DIRECTOR.SPAWN_WINDOW_S + 0.1)
    expect(d().windowLeft).toBe(0)
    expect(d().budget).toBe(0)
    expect(live()).toHaveLength(1 + left)
    expect(live().every((z) => z.type === 'walker')).toBe(true)
    expect(st().getZombiesForWave()).toBe(1 + left)
  })

  it('the wave clears only after the window is over and everything is dead', () => {
    start()
    spawn('walker', 0)
    killAll()
    expect(live()).toHaveLength(0)
    expect(st().phase).toBe('playing')          // window still open: no clear
    expect(st().lastKillPending).toBe(false)
    st().tick(DIRECTOR.SPAWN_WINDOW_S + 0.1)    // autofill spawns the rest
    expect(st().phase).toBe('playing')
    expect(live().length).toBeGreaterThan(0)
    useGameStore.setState({ instaKillOn: true })
    vi.useFakeTimers()
    for (const z of live()) st().hitZombie(z.id, false)
    vi.advanceTimersByTime(2000)
    expect(st().phase).toBe('wave_clear')
    expect(d().turnCleared).toBe(1)
  })

  it('an empty wave (nothing left to fill) clears when the window closes', () => {
    start()
    useGameStore.setState({ director: { ...d(), budget: 0 } })
    st().tick(DIRECTOR.SPAWN_WINDOW_S + 0.1)
    expect(st().phase).toBe('wave_clear')
  })

  it('mod: only in the intermission, one per wave, costs budget and sets the wave modifier', () => {
    start('host', false)
    useGameStore.setState({ wave: 3 })
    expect(st().directorMod({ id: 'm0', mod: 'fog' })).toBe('ok')
    expect(st().waveModifier).toBe('fog')
    expect(d().budget).toBe(waveBudget(1) - 3)
    expect(st().directorMod({ id: 'm0', mod: 'fog' })).toBe('dup')
    expect(st().directorMod({ id: 'm1', mod: 'blackout' })).toBe('rejected')   // one per wave
    openWave()
    expect(st().directorMod({ id: 'm2', mod: 'fog' })).toBe('closed')
  })

  it('mod: locked or unaffordable is rejected', () => {
    start('host', false)
    expect(st().directorMod({ id: 'm1', mod: 'blackout' })).toBe('rejected')   // wave 3
    useGameStore.setState({ wave: 4, director: { ...d(), budget: 2 } })
    expect(st().directorMod({ id: 'm2', mod: 'bloodlust' })).toBe('rejected')
    expect(st().waveModifier).toBe(null)
  })

  it('the next wave starts a fresh budget with the shorter intermission and no rolled modifier', () => {
    start()
    useGameStore.setState({ director: { ...d(), budget: 0 } })
    st().tick(DIRECTOR.SPAWN_WINDOW_S + 0.1)
    expect(st().phase).toBe('wave_clear')
    st().nextWave()
    expect(st().wave).toBe(2)
    expect(st().intermissionLeft).toBe(DIRECTOR.INTERMISSION_S)
    expect(d()).toMatchObject({ budget: waveBudget(2), windowLeft: 0, nextMod: null })
    expect(st().waveModifier).toBe(null)
    st().skipIntermission()
    expect(st().intermissionLeft).toBe(DIRECTOR.INTERMISSION_S)   // skipping is off
  })

  it('tracks damage taken through hitPlayer', () => {
    start()
    st().hitPlayer(5)
    st().hitPlayer(10)
    expect(d().turnDamage).toBe(15)
  })

  it('death ends the turn, not the run', () => {
    start()
    st().hitPlayer(9999)
    expect(st().phase).toBe('intermission')   // never 'dead'
    expect(st().hp).toBe(st().maxHp)
    expect(st().zombies).toEqual([])
    expect(d()).toMatchObject({ role: null, stage: 'between' })
    expect(d().turns[1].host).toMatchObject({ wavesCleared: 0, died: true })
    expect(d().turns[1].host.damageTaken).toBeGreaterThan(0)
    expect(st().runRecorded).toBe(false)
  })

  it('turns progress: swap roles, score the round, continue the run on the next round', () => {
    start('host', false)
    st().directorEndTurn(false)
    expect(d().stage).toBe('between')
    expect(st().directorNext({ round: 1, defender: 'host' })).toBe(false)   // not the next turn
    expect(st().directorNext({ round: 1, defender: 'guest' })).toBe(true)
    expect(d()).toMatchObject({ role: 'director', defender: 'guest', stage: 'turn', turn: 1 })
    expect(st().paused).toBe(true)
    expect(st().receiveDirectorTurn({ round: 1, wavesCleared: 2, damageTaken: 5, died: false })).toBe(true)
    expect(d().rounds).toEqual(['guest'])                                     // host cleared 0, guest 2
    expect(st().receiveDirectorTurn({ round: 1, wavesCleared: 2, damageTaken: 5, died: false })).toBe(false)   // idempotent
    expect(st().directorNext({ round: 2, defender: 'guest' })).toBe(true)
    expect(d()).toMatchObject({ role: 'director', round: 2 })
    // my own run continues at the round's first wave
    expect(st().wave).toBe(4)
  })

  it('a defender keeps money and planks across turns', () => {
    start('host', false)
    useGameStore.setState({ money: 123, windowPlanks: { 0: 2 } })
    st().directorEndTurn(false)
    st().directorNext({ round: 1, defender: 'guest' })
    st().recordDirectorTurn(1, 'guest', { wavesCleared: 3, damageTaken: 0, died: false })
    st().directorNext({ round: 2, defender: 'guest' })
    expect(st().money).toBe(123)
    expect(st().windowPlanks).toEqual({ 0: 2 })
  })

  it('the match ends at 2 round wins and reports win / lose from my side', () => {
    start('host', false)
    const play = (round, hostT, guestT) => {
      st().recordDirectorTurn(round, 'host', hostT)
      st().recordDirectorTurn(round, 'guest', guestT)
    }
    const good = { wavesCleared: 3, damageTaken: 0, died: false }
    const bad = { wavesCleared: 1, damageTaken: 0, died: true }
    play(1, good, bad)
    expect(d().result).toBe(null)
    play(2, good, bad)
    expect(d().rounds).toEqual(['host', 'host'])
    expect(d()).toMatchObject({ result: 'win', stage: 'over' })
    expect(st().versus.result).toBe('win')
    expect(st().paused).toBe(true)
  })

  it('a tied best of 3 is a draw; the guest sees the mirror result', () => {
    start('guest', false)
    const t = { wavesCleared: 2, damageTaken: 10, died: false }
    for (const r of [1, 2, 3]) { st().recordDirectorTurn(r, 'host', t); st().recordDirectorTurn(r, 'guest', t) }
    expect(d().rounds).toEqual(['tie', 'tie', 'tie'])
    expect(d().result).toBe('draw')
  })

  it('the guest loses when the host takes two rounds', () => {
    start('guest', false)
    const good = { wavesCleared: 3, damageTaken: 0, died: false }
    const bad = { wavesCleared: 0, damageTaken: 0, died: true }
    for (const r of [1, 2]) { st().recordDirectorTurn(r, 'host', good); st().recordDirectorTurn(r, 'guest', bad) }
    expect(d().result).toBe('lose')
  })

  it('dir_state view is kept only for the director and the current round', () => {
    start('guest', false)
    expect(st().setDirectorView({ round: 1, wave: 1 })).toBe(true)
    expect(d().view).toMatchObject({ wave: 1 })
    expect(st().setDirectorView({ round: 2, wave: 1 })).toBe(false)
    start('host', false)
    expect(st().setDirectorView({ round: 1 })).toBe(false)
  })

  it('forfeit mid-turn ends the match and freezes the world', () => {
    start()
    st().finishVersus('win', 'forfeit')
    expect(d()).toMatchObject({ result: 'win', stage: 'over', role: null })
    expect(st().paused).toBe(true)
  })

  it('mail mechanics stay off in director mode', () => {
    start()
    expect(st().spendMail('brute')).toBe(null)
    expect(st().receiveMail({ id: 'm1', item: 'brute' })).toBe(false)
    useGameStore.setState({ instaKillOn: true })
    spawn('walker')
    st().hitZombie(live()[0].id, false)
    expect(st().mail.meter).toBe(0)
  })
})
