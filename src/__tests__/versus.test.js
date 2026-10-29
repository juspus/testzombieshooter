import { describe, it, expect, beforeEach, vi } from 'vitest'

const net = vi.hoisted(() => ({ listeners: new Map(), send: vi.fn() }))
vi.mock('../net', () => ({
  send: net.send,
  onMessage: (type, fn) => net.listeners.set(type, fn),
}))

import { VERSUS_MODES, isVersusMode, scoreSubmittable, compareResult, sendVersus, onVersus, _resetVersusHandlers } from '../versus'

describe('versus rules', () => {
  it('registers Zombie Mail only (co-op is the lobby default)', () => {
    expect(Object.keys(VERSUS_MODES)).toEqual(['mail'])
    expect(VERSUS_MODES.mail.label).toBe('Zombie Mail')
    expect(isVersusMode('mail')).toBe(true)
    expect(isVersusMode('coop')).toBe(false)
    expect(isVersusMode('toString')).toBe(false)
  })

  it('only normal and daily runs submit scores', () => {
    expect(scoreSubmittable('normal')).toBe(true)
    expect(scoreSubmittable('daily')).toBe(true)
    expect(scoreSubmittable('versus')).toBe(false)
    expect(scoreSubmittable('duel')).toBe(false)
  })

  it('compareResult: alive beats dead, then wave, then kills, else draw', () => {
    const r = (wave, kills, alive) => ({ wave, kills, alive })
    expect(compareResult(r(1, 0, true), r(9, 99, false))).toBe('win')
    expect(compareResult(r(9, 99, false), r(1, 0, true))).toBe('lose')
    expect(compareResult(r(5, 1, false), r(4, 90, false))).toBe('win')
    expect(compareResult(r(4, 90, false), r(5, 1, false))).toBe('lose')
    expect(compareResult(r(4, 10, false), r(4, 9, false))).toBe('win')
    expect(compareResult(r(4, 9, false), r(4, 10, false))).toBe('lose')
    expect(compareResult(r(4, 9, false), r(4, 9, false))).toBe('draw')
    expect(compareResult(r(4, 9, true), r(4, 9, true))).toBe('draw')
  })
})

describe('versus message multiplexer', () => {
  beforeEach(() => { net.listeners.clear(); net.send.mockClear(); _resetVersusHandlers() })

  it('sends net type versus with { kind, data }', () => {
    sendVersus('status', { hp: 3 })
    expect(net.send).toHaveBeenCalledWith('versus', { kind: 'status', data: { hp: 3 } })
  })

  it('installs one net listener and dispatches by kind', () => {
    const a = vi.fn(); const b = vi.fn()
    onVersus('mail', a)
    onVersus('status', b)
    const listener = net.listeners.get('versus')
    expect(listener).toBeTypeOf('function')
    listener({ kind: 'mail', data: 1 })
    expect(a).toHaveBeenCalledWith(1)
    expect(b).not.toHaveBeenCalled()
    listener({ kind: 'nope', data: 2 })
    listener(null)
    listener({ data: 3 })
  })

  it('unsubscribe stops delivery; a throwing handler does not block others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn()
    onVersus('k', () => { throw new Error('x') })
    const off = onVersus('k', ok)
    net.listeners.get('versus')({ kind: 'k', data: 1 })
    expect(ok).toHaveBeenCalledTimes(1)
    off()
    net.listeners.get('versus')({ kind: 'k', data: 2 })
    expect(ok).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
