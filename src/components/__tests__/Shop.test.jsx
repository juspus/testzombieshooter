import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Shop from '../Shop'
import { useGameStore } from '../../store'

vi.mock('../../store', () => ({
  useGameStore: vi.fn(),
  AK_COST: 500, AK_CLIP: 30,
  DEAGLE_COST: 800, DEAGLE_CLIP: 7,
  SHOTGUN_COST: 600, SHOTGUN_CLIP: 8,
  AMMO_PACK_COST: 100, AMMO_PACK_AMOUNT: 60,
  DEEP_POCKETS_AMMO_PACK_AMOUNT: 120,
  PERK_COSTS: {
    fast_hands: 200, deep_pockets: 200, iron_sights: 300,
    runners_breath: 300, carpenter: 200, knife_mastery: 300,
  },
  STRONG_PLANK_COST: 25,
}))

function makeStore(overrides = {}) {
  return {
    shopOpen: true,
    closeShop: vi.fn(),
    buyItem: vi.fn(),
    buyPerk: vi.fn(),
    money: 500,
    weapon: 'pistol',
    perks: {},
    strongPlanksMode: false,
    toggleStrongPlanksMode: vi.fn(),
    ...overrides,
  }
}

function setupStore(overrides = {}) {
  const store = makeStore(overrides)
  vi.mocked(useGameStore).mockImplementation((sel) => sel(store))
  return store
}

describe('Shop visibility', () => {
  it('is CSS-hidden (not unmounted) when shopOpen is false', () => {
    setupStore({ shopOpen: false })
    const { container } = render(<Shop />)
    // Shop always stays in DOM so iOS never creates a new GPU compositing layer
    // on open (which would blank the WebGL canvas). Check CSS visibility instead.
    expect(container.firstChild).not.toBeNull()
    expect(container.firstChild.style.visibility).toBe('hidden')
    expect(container.firstChild.style.pointerEvents).toBe('none')
  })

  it('renders the overlay when shopOpen is true', () => {
    setupStore()
    render(<Shop />)
    expect(screen.getByText('SUPPLY CHEST')).toBeInTheDocument()
  })

  it('shows the current money balance', () => {
    setupStore({ money: 123.45 })
    render(<Shop />)
    expect(screen.getByText('€123.45')).toBeInTheDocument()
  })
})

describe('Shop overlay click guard (iOS synthesized click)', () => {
  let mockNow
  let nowSpy

  beforeEach(() => {
    mockNow = 1000
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockNow)
  })

  afterEach(() => {
    nowSpy.mockRestore()
  })

  it('blocks backdrop click within 500 ms of opening (synthesized click window)', () => {
    const store = setupStore()
    render(<Shop />)

    // Simulate iOS synthesized click arriving 150 ms after the shop opened
    mockNow = 1150
    const overlay = screen.getByText('SUPPLY CHEST').closest('[style]')
    // Walk up to the outermost overlay div (the backdrop)
    let backdrop = overlay
    while (backdrop.parentElement && backdrop.parentElement !== document.body) {
      backdrop = backdrop.parentElement
    }
    fireEvent.click(backdrop, { target: backdrop, currentTarget: backdrop })

    expect(store.closeShop).not.toHaveBeenCalled()
  })

  it('allows backdrop click after 500 ms (genuine user tap)', () => {
    const store = setupStore()
    render(<Shop />)

    // Click 600 ms after the shop opened
    mockNow = 1600
    const backdrop = screen.getByText('SUPPLY CHEST').parentElement.parentElement.parentElement
    fireEvent.click(backdrop, { target: backdrop, currentTarget: backdrop })

    expect(store.closeShop).toHaveBeenCalledTimes(1)
  })
})

describe('Shop close button', () => {
  it('calls closeShop when the × button is tapped on mobile', () => {
    // Force isMobile = true by making matchMedia return true
    window.matchMedia = vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, writable: true })

    const store = setupStore()
    render(<Shop />)

    const closeBtn = screen.getByText('×')
    fireEvent.click(closeBtn)

    expect(store.closeShop).toHaveBeenCalledTimes(1)
  })
})

describe('Shop panel click isolation', () => {
  it('clicking inside the panel does not close the shop', () => {
    const store = setupStore()
    render(<Shop />)

    // Click the title text (inside the panel, not the backdrop)
    fireEvent.click(screen.getByText('SUPPLY CHEST'))

    expect(store.closeShop).not.toHaveBeenCalled()
  })
})
