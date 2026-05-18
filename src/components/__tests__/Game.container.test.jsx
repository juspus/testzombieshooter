import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock everything that Game.jsx imports so we don't need WebGL
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ gl: { render: vi.fn() }, scene: {}, camera: {} }),
}))
vi.mock('../Arena', () => ({ default: () => null }))
vi.mock('../Player', () => ({ default: () => null }))
vi.mock('../Gun', () => ({ default: () => null }))
vi.mock('../Knife', () => ({ default: () => null }))
vi.mock('../ZombieManager', () => ({ default: () => null }))
vi.mock('../BulletTrails', () => ({ default: () => null }))
vi.mock('../ShellCasings', () => ({ default: () => null }))
vi.mock('../HUD', () => ({ default: () => null }))
vi.mock('../Screens', () => ({ default: () => null }))
vi.mock('../Shop', () => ({ default: () => null }))
vi.mock('../ForestSkybox', () => ({ default: () => null }))
vi.mock('../MobileControls', () => ({ default: () => null }))
vi.mock('../../useMobileViewport', () => ({ default: () => {} }))
vi.mock('../../sounds', () => ({ startEerieMusic: vi.fn(), stopEerieMusic: vi.fn() }))
vi.mock('../../store', () => ({
  useGameStore: vi.fn((sel) => sel({ phase: 'menu' })),
}))

import Game from '../Game'

describe('Game container', () => {
  it('uses CSS variable dimensions instead of inset:0 to prevent canvas clear on iOS address bar toggle', () => {
    const { container } = render(<Game />)
    const root = container.firstChild
    const style = root.style

    // Must use CSS variable width/height so R3F never sees a resize when
    // the iOS address bar shows/hides (setSize() always clears the canvas)
    expect(style.width).toContain('--app-width')
    expect(style.height).toContain('--app-height')

    // Must NOT use inset shorthand (which stretches to viewport and resizes)
    expect(style.inset).toBeFalsy()
  })
})

describe('setSize guard logic', () => {
  // Unit tests for the guard logic embedded in onCreated — tested in isolation
  // by replicating the exact conditional from Game.jsx.
  function wouldBlock(cw, ch, newW, newH) {
    if (Math.abs(newW - cw) < 1 && Math.abs(newH - ch) < 1) return true
    if (Math.abs(newW - cw) < 1 && Math.abs(newH - ch) / ch < 0.15) return true
    return false
  }

  it('blocks setSize when dimensions are unchanged (spurious ResizeObserver callback)', () => {
    expect(wouldBlock(390, 844, 390, 844)).toBe(true)
  })

  it('blocks small height-only change caused by iOS address bar (~4% of height)', () => {
    // Address bar on iPhone is ~38px on an 844px viewport = 4.5%
    expect(wouldBlock(390, 844, 390, 806)).toBe(true)
  })

  it('allows large height change from orientation change', () => {
    // Landscape → portrait: height increases from 390 to 844
    expect(wouldBlock(844, 390, 390, 844)).toBe(false)
  })

  it('allows width change from orientation change', () => {
    expect(wouldBlock(390, 844, 844, 390)).toBe(false)
  })

  it('allows legitimate resize when both dimensions change', () => {
    expect(wouldBlock(390, 844, 428, 926)).toBe(false)
  })
})
