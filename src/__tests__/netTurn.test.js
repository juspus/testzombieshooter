import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildPeerOptions, getPeerOptions } from '../net'

describe('buildPeerOptions', () => {
  it('falls back to PeerJS defaults (undefined) on empty or bad input', () => {
    expect(buildPeerOptions(undefined)).toBeUndefined()
    expect(buildPeerOptions({})).toBeUndefined()
    expect(buildPeerOptions({ iceServers: [] })).toBeUndefined()
    expect(buildPeerOptions({ iceServers: [{ username: 'x' }, null] })).toBeUndefined()
  })
  it('puts STUN first and appends TURN servers', () => {
    const turn = { urls: ['turn:t.example:3478'], username: 'u', credential: 'c' }
    const o = buildPeerOptions({ iceServers: [turn] })
    expect(o.config.iceServers).toHaveLength(2)
    expect(o.config.iceServers[0].urls).toMatch(/^stun:/)
    expect(o.config.iceServers[1]).toEqual(turn)
  })
})

describe('getPeerOptions', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('resolves undefined silently when the fetch fails (and memoizes)', async () => {
    const f = vi.fn(() => Promise.reject(new Error('no api')))
    vi.stubGlobal('fetch', f)
    expect(await getPeerOptions()).toBeUndefined()
    expect(await getPeerOptions()).toBeUndefined()
    expect(f).toHaveBeenCalledTimes(1)
  })
})
