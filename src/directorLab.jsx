// Dev-only harness for the Director's screen (see /directorlab.html). Records every message the
// view sends in window.__lab.sent instead of using the network.
import { createRoot } from 'react-dom/client'
import DirectorView from './components/DirectorView'

const sent = []
window.__lab = { sent }
createRoot(document.getElementById('root')).render(<DirectorView send={(kind, data) => sent.push({ kind, data })} />)
