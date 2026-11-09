import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { rangeValueAt, clickTargetOf, useVirtualCursor, isCursorActive, refresh, installVirtualCursor, onCursorActive } from '../virtualCursor'

describe('virtual cursor helpers', () => {
  it('maps the arrow to a slider value, snapped and clamped', () => {
    const r = { min: 0.5, max: 2, step: 0.05 }
    expect(rangeValueAt(r, 100, 200, 100)).toBe(0.5)
    expect(rangeValueAt(r, 100, 200, 300)).toBe(2)
    expect(rangeValueAt(r, 100, 200, 200)).toBe(1.25)
    expect(rangeValueAt(r, 100, 200, 9999)).toBe(2)
    expect(rangeValueAt(r, 100, 200, -50)).toBe(0.5)
    expect(rangeValueAt({ min: 0, max: 1, step: 0.05 }, 0, 100, 33)).toBe(0.35)
  })

  it('clicks land on the nearest element holding press and release', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div id=a><button id=b><span id=c></span></button></div><div id=d></div>'
    document.body.appendChild(root)
    const $ = (id) => root.querySelector('#' + id)
    expect(clickTargetOf($('b'), $('b'))).toBe($('b'))
    expect(clickTargetOf($('b'), $('c'))).toBe($('b'))   // pressed the button, released on its label
    expect(clickTargetOf($('c'), $('b'))).toBe($('b'))
    expect(clickTargetOf($('b'), $('d'))).toBe(root)     // dragged off: no click on the button
    expect(clickTargetOf(null, $('b'))).toBe(null)
    root.remove()
  })
})

describe('virtual cursor on/off', () => {
  let locked = null
  beforeAll(() => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
    installVirtualCursor()
  })
  afterEach(() => { locked = null; refresh() })

  it('shows only while a screen asks for it AND the game holds the mouse', () => {
    const seen = []
    const stop = onCursorActive((on) => seen.push(on))
    const { rerender, unmount } = renderHook(({ open }) => useVirtualCursor(open), { initialProps: { open: false } })
    expect(isCursorActive()).toBe(false)
    rerender({ open: true })
    expect(isCursorActive()).toBe(false)          // menu up, mouse not held: the real cursor works
    locked = document.createElement('canvas')
    refresh()                                      // pointerlockchange
    expect(isCursorActive()).toBe(true)
    expect(document.querySelector('[data-testid=virtual-cursor]').style.display).toBe('block')
    locked = null
    refresh()                                      // browser freed the mouse
    expect(isCursorActive()).toBe(false)
    locked = document.createElement('canvas')
    refresh()
    rerender({ open: false })                      // menu closed: back to aiming
    expect(isCursorActive()).toBe(false)
    unmount()
    stop()
    expect(seen).toEqual([true, false, true, false])
  })
})
