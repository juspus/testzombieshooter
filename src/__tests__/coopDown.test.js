import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))
const sent = []
vi.mock('../net', () => ({ send: (t, d) => sent.push([t, d]), isConnected: () => true }))
vi.mock('../analytics', () => ({ track: vi.fn() }))

import { useGameStore } from '../store'
import * as C from '../coopDown'
import { track } from '../analytics'
import { handleCoopEvent, tickCoop, coopWaveEnd, coopDisconnected, reportRevive } from '../coopRuntime'
import { parseInviteParam, stripJoinParam, buildInviteLink, isValidRoomCode } from '../invite'

describe('coopDown state machine', () => {
  it('goes down (not dead) while the partner stands', () => {
    const { coop, events } = C.goDown(C.createCoop(), 'host')
    expect(coop.host).toEqual({ status: 'down', bleed: C.BLEED_TIME, revive: 0 })
    expect(coop.guest.status).toBe('alive')
    expect(events).toEqual([{ type: 'down', role: 'host' }])
  })

  it('does not mutate its input and ignores a second down', () => {
    const c0 = C.createCoop()
    const { coop: c1 } = C.goDown(c0, 'host')
    expect(c0.host.status).toBe('alive')
    const again = C.goDown(c1, 'host')
    expect(again.coop).toBe(c1)
    expect(again.events).toEqual([])
  })

  it('both players down is a wipe', () => {
    const a = C.goDown(C.createCoop(), 'host').coop
    const { events } = C.goDown(a, 'guest')
    expect(events.map((e) => e.type)).toEqual(['down', 'wipe'])
  })

  it('going down while the partner is bled out is a wipe', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    c = C.tick(c, C.BLEED_TIME + 1).coop
    expect(c.guest.status).toBe('dead')
    expect(C.goDown(c, 'host').events.map((e) => e.type)).toEqual(['down', 'wipe'])
  })

  it('bleeds out after BLEED_TIME and not before', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    let r = C.tick(c, C.BLEED_TIME - 0.5)
    expect(r.events).toEqual([])
    expect(r.coop.guest.bleed).toBeCloseTo(0.5)
    r = C.tick(r.coop, 0.6)
    expect(r.coop.guest.status).toBe('dead')
    expect(r.events).toEqual([{ type: 'bled_out', role: 'guest' }])   // host still stands: no wipe
  })

  it('both bleeding out in one tick is a wipe', () => {
    let c = C.goDown(C.createCoop(), 'host').coop
    c = { ...c, guest: { status: 'down', bleed: 1, revive: 0 } }
    const r = C.tick(c, 31)
    expect(r.events.map((e) => e.type)).toEqual(['bled_out', 'bled_out', 'wipe'])
  })

  it('non-authoritative (guest display) tick never kills', () => {
    const c = C.goDown(C.createCoop(), 'guest').coop
    const r = C.tick(c, 99, false)
    expect(r.coop.guest.status).toBe('down')
    expect(r.events).toEqual([])
  })

  it('revive: progress accumulates, completing returns the player standing', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    c = C.setRevive(c, 'guest', 0.4).coop
    expect(c.guest.revive).toBe(0.4)
    const r = C.setRevive(c, 'guest', 1)
    expect(r.coop.guest).toEqual({ status: 'alive', bleed: 0, revive: 0 })
    expect(r.events).toEqual([{ type: 'revived', role: 'guest', by: 'host' }])
  })

  it('interrupted hold resets (progress 0)', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    c = C.setRevive(c, 'guest', 0.7).coop
    c = C.setRevive(c, 'guest', 0).coop
    expect(c.guest.revive).toBe(0)
    expect(c.guest.status).toBe('down')
  })

  it('cannot revive a standing or dead player, or be revived by a downed partner', () => {
    expect(C.setRevive(C.createCoop(), 'guest', 1).events).toEqual([])
    const both = C.goDown(C.goDown(C.createCoop(), 'host').coop, 'guest').coop
    expect(C.setRevive(both, 'guest', 1).events).toEqual([])
  })

  it('a reviver who goes down loses their revive progress on the partner', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    c = C.setRevive(c, 'guest', 0.5).coop
    c = C.goDown(c, 'host').coop
    expect(c.guest.revive).toBe(0)
  })

  it('wave end stands up downed players and respawns dead ones', () => {
    let c = C.goDown(C.createCoop(), 'guest').coop
    c = C.tick(c, 99).coop                        // guest dead
    const r = C.waveEnd(c)
    expect(r.coop).toEqual(C.createCoop())
    expect(r.events).toEqual([{ type: 'revived', role: 'guest', by: null, respawn: true }])
    expect(C.waveEnd(C.createCoop()).events).toEqual([])
  })

  it('stepRevive: 3 s hold, any interruption or leaving range resets', () => {
    let p = 0
    for (let i = 0; i < 29; i++) p = C.stepRevive(p, true, true, 0.1)
    expect(p).toBeLessThan(1)
    expect(C.stepRevive(p, true, true, 0.2)).toBe(1)
    expect(C.stepRevive(p, false, true, 0.1)).toBe(0)
    expect(C.stepRevive(p, true, false, 0.1)).toBe(0)
  })

  it('range is 1.5 m', () => {
    expect(C.inReviveRange(0, 0, 1.4, 0)).toBe(true)
    expect(C.inReviveRange(0, 0, 1.6, 0)).toBe(false)
  })

  it('helpers: revive HP, sidearm, bearing', () => {
    expect(C.reviveHp(100)).toBe(50)
    expect(C.reviveHp(101)).toBe(51)
    expect(C.sidearmFor(['ak47', 'pistol'], 'ak47')).toBe('pistol')
    expect(C.sidearmFor(['ak47', 'deagle'], 'deagle')).toBe('deagle')
    // yaw 0 looks toward -z: a target at -z is dead ahead, +x is to the right
    expect(C.relativeBearing(0, 0, 0, 0, -5)).toBeCloseTo(0)
    expect(C.relativeBearing(0, 0, 0, 5, 0)).toBeCloseTo(Math.PI / 2)
    expect(Math.abs(C.relativeBearing(0, 0, 0, 0, 5))).toBeCloseTo(Math.PI)
  })
})

describe('invite links', () => {
  it('builds, parses and strips', () => {
    expect(buildInviteLink('https://x.app', 'ABCDE')).toBe('https://x.app/?join=ABCDE')
    expect(parseInviteParam('?join=abcde')).toEqual({ code: 'ABCDE' })
    expect(parseInviteParam('?wave=3')).toBeNull()
    expect(stripJoinParam('https://x.app/?join=ABCDE&wave=3#h')).toBe('/?wave=3#h')
    expect(stripJoinParam('https://x.app/?join=ABCDE')).toBe('/')
  })
  it('validates codes against the room-code alphabet', () => {
    expect(isValidRoomCode('ABCDE')).toBe(true)
    expect(isValidRoomCode('ABCD')).toBe(false)     // too short
    expect(isValidRoomCode('ABCD0')).toBe(false)    // 0 is not in the alphabet
    expect(isValidRoomCode('abcde')).toBe(false)
  })
})

const playing = (extra = {}) => {
  useGameStore.getState().startGame()
  useGameStore.setState({ phase: 'playing', ...extra })
}

describe('store integration', () => {
  beforeEach(() => { sent.length = 0; vi.clearAllMocks() })

  it('solo: 0 HP is still death', () => {
    playing({ mpRole: null, mpConnected: false })
    useGameStore.getState().hitPlayer(9999)
    expect(useGameStore.getState().phase).toBe('dead')
    expect(useGameStore.getState().coop.host.status).toBe('alive')
  })

  it('co-op: 0 HP goes down, locks to the pistol, and zombies can no longer hurt you', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.setState({ ownedWeapons: ['pistol', 'ak47'], weapon: 'ak47' })
    useGameStore.getState().hitPlayer(9999)
    const s = useGameStore.getState()
    expect(s.phase).toBe('playing')
    expect(s.coop.host.status).toBe('down')
    expect(s.hp).toBe(0)
    expect(s.weapon).toBe('pistol')
    expect(s.reserveBullets).toBeGreaterThanOrEqual(20)
    expect(sent.some(([, d]) => d.event === 'player_down' && d.data.coop.host.status === 'down')).toBe(true)
    // locked: no weapon switch, no knife, no shop; further damage ignored
    s.switchWeapon('ak47')
    s.toggleItem()
    s.openShop()
    const s2 = useGameStore.getState()
    expect(s2.weapon).toBe('pistol')
    expect(s2.activeItem).toBe('gun')
    expect(s2.shopOpen).toBe(false)
    const hid = s2.hitEventId
    s2.hitPlayer(10)
    expect(useGameStore.getState().hitEventId).toBe(hid)
  })

  it('both players down ends the game for both (existing death flow)', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.getState().hitPlayer(9999)
    expect(useGameStore.getState().phase).toBe('playing')
    handleCoopEvent('player_down', {})   // guest reports being down
    expect(useGameStore.getState().phase).toBe('dead')
  })

  it('guest revives host: back at 50% max HP, event emitted for progression', () => {
    playing({ mpRole: 'host', mpConnected: true })
    const maxHp = useGameStore.getState().maxHp
    useGameStore.getState().hitPlayer(9999)
    handleCoopEvent('revive_progress', { p: 0.5 })
    expect(useGameStore.getState().coop.host.revive).toBe(0.5)
    handleCoopEvent('revive_progress', { p: 1 })
    const s = useGameStore.getState()
    expect(s.coop.host.status).toBe('alive')
    expect(s.hp).toBe(Math.ceil(maxHp / 2))
    expect(s.revivedByPartnerEventId).toBe(1)
    expect(sent.some(([, d]) => d.event === 'player_revived')).toBe(true)
  })

  it('host reviving the guest bumps revivedPartnerEventId and tracks analytics', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.setState({ coop: C.goDown(C.createCoop(), 'guest').coop })
    reportRevive(1)
    const s = useGameStore.getState()
    expect(s.coop.guest.status).toBe('alive')
    expect(s.revivedPartnerEventId).toBe(1)
    expect(track).toHaveBeenCalledWith('revive', expect.anything())
  })

  it('bleed-out timer ticks on the host; bleeding out one player does not end the run', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.setState({ coop: C.goDown(C.createCoop(), 'guest').coop })
    for (let i = 0; i < 31 * 10; i++) tickCoop(0.1)
    const s = useGameStore.getState()
    expect(s.coop.guest.status).toBe('dead')
    expect(s.phase).toBe('playing')
    expect(sent.some(([, d]) => d.event === 'player_bled_out')).toBe(true)
  })

  it('bleeding out while the partner is also down ends the game', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.getState().hitPlayer(9999)       // host down
    handleCoopEvent('player_down', {})             // guest down -> already a wipe
    expect(useGameStore.getState().phase).toBe('dead')
  })

  it('wave end: dead players respawn and downed players stand (host broadcasts)', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.getState().hitPlayer(9999)        // host down, guest standing
    coopWaveEnd()
    const s = useGameStore.getState()
    expect(s.coop.host.status).toBe('alive')
    expect(s.hp).toBeGreaterThan(0)
  })

  it('losing the partner while downed ends the run; while standing just resets', () => {
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.getState().hitPlayer(9999)
    useGameStore.setState({ mpConnected: false })
    coopDisconnected()
    expect(useGameStore.getState().phase).toBe('dead')
    playing({ mpRole: 'host', mpConnected: true })
    useGameStore.setState({ coop: C.goDown(C.createCoop(), 'guest').coop })
    useGameStore.setState({ mpConnected: false })
    coopDisconnected()
    expect(useGameStore.getState().phase).toBe('playing')
    expect(useGameStore.getState().coop.guest.status).toBe('alive')
  })

  it('startGame resets the machine', () => {
    useGameStore.setState({ coop: C.goDown(C.createCoop(), 'guest').coop })
    useGameStore.getState().startGame()
    expect(useGameStore.getState().coop).toEqual(C.createCoop())
  })
})
