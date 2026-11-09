import { describe, it, expect, beforeEach, vi } from 'vitest'
import { lockPointer, captureMouse, setLockTarget, _resetDesktopInput } from '../desktopInput'
import { useSettings } from '../settings'

const flush = () => new Promise((r) => setTimeout(r, 0))

function fakeCanvas(rawError) {
  const calls = []
  return {
    calls,
    requestPointerLock: vi.fn((opts) => {
      calls.push(opts ? 'raw' : 'plain')
      if (opts && rawError) return Promise.reject(Object.assign(new Error('x'), { name: rawError }))
      return Promise.resolve()
    }),
  }
}

describe('desktop pointer lock', () => {
  beforeEach(() => {
    _resetDesktopInput()
    useSettings.setState({ rawMouse: true, fullscreen: true })
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
  })

  it('asks for raw input first', async () => {
    const c = fakeCanvas()
    await lockPointer(c)
    expect(c.calls).toEqual(['raw'])
    expect(c.requestPointerLock).toHaveBeenCalledWith({ unadjustedMovement: true })
  })

  it('falls back to plain lock when raw input is not supported, and remembers it', async () => {
    const c = fakeCanvas('NotSupportedError')
    await lockPointer(c)
    expect(c.calls).toEqual(['raw', 'plain'])
    await lockPointer(c)
    expect(c.calls).toEqual(['raw', 'plain', 'plain'])
  })

  it('does not retry on other refusals (e.g. no user gesture)', async () => {
    const c = fakeCanvas('NotAllowedError')
    await lockPointer(c)
    expect(c.calls).toEqual(['raw'])
  })

  it('RAW MOUSE off: plain lock only', async () => {
    useSettings.setState({ rawMouse: false })
    const c = fakeCanvas()
    await lockPointer(c)
    expect(c.calls).toEqual(['plain'])
  })

  it('locks the mouse before going fullscreen (fullscreen uses up the click)', async () => {
    const order = []
    const c = fakeCanvas('NotSupportedError')
    c.requestPointerLock.mockImplementation((opts) => {
      order.push(opts ? 'raw' : 'plain')
      return opts ? Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' })) : Promise.resolve()
    })
    document.documentElement.requestFullscreen = vi.fn(() => { order.push('fullscreen'); return Promise.resolve() })
    setLockTarget(c)
    await captureMouse()
    await flush()
    expect(order).toEqual(['raw', 'plain', 'fullscreen'])
  })

  it('FULLSCREEN off: no fullscreen request', async () => {
    useSettings.setState({ fullscreen: false })
    setLockTarget(fakeCanvas())
    await captureMouse()
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled()
  })
})
