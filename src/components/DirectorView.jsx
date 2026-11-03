// The Director's screen: a full-screen top-down map of the defender's world, shown while this
// player directs (store `director.role === 'director'`). Reads the latest defender snapshot from
// `director.view` (see makeState in src/director.js) and sends dir_spawn / dir_mod with
// sendVersus. Placeholder until the Director view is built.
import { useGameStore } from '../store'

export default function DirectorView() {
  const directing = useGameStore((s) => s.director?.role === 'director')
  if (!directing) return null
  return null
}
