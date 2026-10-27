// First-run control hints. Permanent key-hint text is noise once a player knows the
// controls, so hints show only until the player has started HINT_WAVES waves in total
// (persisted in localStorage; wrapped in try/catch — renders hints-on without storage).
const KEY = 'cabin.hintWaves'
export const HINT_WAVES = 3

export function hintWavesSeen() {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 }
}
export function noteWaveStarted() {
  try { localStorage.setItem(KEY, String(hintWavesSeen() + 1)) } catch { /* ignore */ }
}
export function hintsActive() {
  return hintWavesSeen() < HINT_WAVES
}
