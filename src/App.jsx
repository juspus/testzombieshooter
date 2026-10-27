import { lazy, Suspense } from 'react'
import Game from './components/Game'

// Dev tools (ungated, same as the old Test Lab): loaded lazily so the game
// bundle path is unchanged.
const TestLab = lazy(() => import('./components/TestLab'))
const ModelPlayground = lazy(() => import('./playground/ModelPlayground'))

export default function App() {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search)
    if (q.has('models')) return <Suspense fallback={null}><ModelPlayground /></Suspense>
    if (window.location.search.includes('testlab')) return <Suspense fallback={null}><TestLab /></Suspense>
  }
  return <Game />
}
