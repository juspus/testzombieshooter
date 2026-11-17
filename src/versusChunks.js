// Lazy loaders for the versus-only UI. These pieces ship in their own chunks so a solo player
// never downloads them (vite.config.js leaves them out of the main chunk). One promise per chunk:
// every React.lazy wrapper and every preload shares it.
let _duel
let _result

/** Seed Duel UI (DuelPanel, DuelHudStat, DuelDeath). */
export const loadDuelUi = () => (_duel ||= import('./components/DuelUi'))

/** Death-screen block of a Zombie Mail / Director run. */
export const loadVersusResult = () => (_result ||= import('./components/VersusResult'))

/** Warm both chunks (called when the Versus menu opens, so the click that needs them finds them cached). */
export const preloadVersusUi = () => { loadDuelUi(); loadVersusResult() }
