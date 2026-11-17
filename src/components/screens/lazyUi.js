// Seed Duel and versus-result UI live in their own chunks (a solo player never loads them).
// Keep these three lazy(): a static import would pull the chunks into the main bundle.
import { lazy } from 'react'
import { loadDuelUi, loadVersusResult } from '../../versusChunks'

// Seed Duel and versus-result UI live in their own chunks (a solo player never loads them).
export const DuelPanel = lazy(() => loadDuelUi().then((m) => ({ default: m.DuelPanel })))
export const DuelDeath = lazy(() => loadDuelUi().then((m) => ({ default: m.DuelDeath })))
export const VersusResult = lazy(() => loadVersusResult())
