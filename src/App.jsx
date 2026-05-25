import Game from './components/Game'
import TestLab from './components/TestLab'

export default function App() {
  if (typeof window !== 'undefined' && window.location.search.includes('testlab')) {
    return <TestLab />
  }
  return <Game />
}
