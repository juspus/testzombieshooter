import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

vi.mock('../profilePersistence', () => ({
  persistProfile: vi.fn(), hydrateStoreFromLocal: vi.fn(), syncProfileWithCloud: vi.fn(),
}))
vi.mock('../sounds', async (orig) => ({ ...(await orig()), playVolumePreview: vi.fn() }))

import Screens from '../components/Screens'
import { useGameStore } from '../store'

// Guards the Screens.jsx split (docs/next-roadmap.html t-split-files). Screens.jsx exports only a
// default component, so the shape is what it draws: the markup of the start menu (title included),
// each of its panels, wave cleared, intermission, death and the guest pause overlay. The fixture was
// captured from the single-file Screens.jsx before the split. Regenerate on purpose only:
//   UPDATE_SCREENS_SHAPE=1 npx vitest run src/__tests__/screens.shape.test.jsx
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screens.shape.json')
const was = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : {}
const now = {}

const html = (c) => c.innerHTML.replace(/\s+style="[^"]*--ui-[^"]*"/g, '')

function check(name, container) {
  now[name] = html(container)
  if (!process.env.UPDATE_SCREENS_SHAPE) expect(now[name]).toBe(was[name])
}

afterEach(() => {
  cleanup()
  if (process.env.UPDATE_SCREENS_SHAPE) fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n')
})

const base = { phase: 'start', paused: false, mpRole: null, director: { active: false } }

describe('Screens markup (survives the split)', () => {
  it('exports one default component', async () => {
    const mod = await import('../components/Screens')
    expect(Object.keys(mod)).toEqual(['default'])
    expect(typeof mod.default).toBe('function')
  })

  it('start menu and every panel', () => {
    useGameStore.setState(base)
    const { container } = render(<Screens />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CABIN')
    check('start', container)
    const panels = [
      ['menu-coop', 'coop-panel'], ['menu-versus', 'versus-panel'], ['menu-loadout', null], ['menu-progress', null],
      ['menu-locker', 'locker-panel'], ['menu-settings', null],
    ]
    for (const [item, panel] of panels) {
      fireEvent.click(screen.getByTestId(item))
      if (panel) expect(screen.queryByTestId(panel)).not.toBeNull()
      check(`panel:${item}`, container)
      fireEvent.click(screen.getByTestId(item))   // toggle closed
    }
    // Versus sub-menus: Zombie Mail lobby (idle), The Director lobby
    fireEvent.click(screen.getByTestId('menu-versus'))
    fireEvent.click(screen.getByTestId('versus-mail'))
    expect(screen.queryByTestId('mail-panel')).not.toBeNull()
    check('versus:mail', container)
  })

  it('wave cleared', () => {
    useGameStore.setState({
      ...base, phase: 'wave_clear', wave: 3, kills: 21, waveKills: 11,
      lastWaveBonuses: {
        base: 15, kills: 11, headshots: 3.5, headshotsCount: 7, knifeKills: 4, knifeKillsCount: 2,
        noPlanksLost: 10, modifier: 'blackout', modifierBonus: 5, fastClear: 8, elapsed: 61, total: 23,
      },
    })
    const { container } = render(<Screens />)
    check('wave_clear', container)
  })

  it('intermission', () => {
    useGameStore.setState({ ...base, phase: 'intermission', wave: 4, intermissionLeft: 17, money: 120, skipProgress: 0.4, waveModifier: null })
    const { container } = render(<Screens />)
    check('intermission', container)
    act(() => useGameStore.setState({ waveModifier: 'blackout' }))
    check('intermission:modifier', container)
  })

  it('you died', () => {
    useGameStore.setState({ ...base, phase: 'dead', wave: 5, kills: 40, money: 77, weapon: 'ak47', runMode: 'normal' })
    const { container } = render(<Screens />)
    check('dead', container)
  })

  it('guest pause overlay and director freeze', () => {
    useGameStore.setState({ ...base, phase: 'playing', paused: true, mpRole: 'guest' })
    const a = render(<Screens />)
    check('paused-guest', a.container)
    cleanup()
    useGameStore.setState({ ...base, phase: 'start', director: { active: true, role: 'director' } })
    const b = render(<Screens />)
    expect(b.container.innerHTML).toBe('')
  })
})
