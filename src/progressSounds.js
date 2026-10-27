// Small UI stingers for Wave 4 progression. Own lazy AudioContext (sounds.js keeps its
// context private; this avoids touching that big file). Never throws.

let ac = null
function ctx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)()
  if (ac.state === 'suspended') ac.resume()
  return ac
}

function tone(a, t, f, dur, vol, type = 'triangle') {
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g)
  g.connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function play(notes, step, dur, vol, type) {
  try {
    const a = ctx()
    const t = a.currentTime
    notes.forEach((f, i) => tone(a, t + i * step, f, dur, vol, type))
  } catch { /* audio unavailable */ }
}

export const playLevelUp = () => play([523, 659, 784, 1046, 1319], 0.09, 0.45, 0.09)
export const playChallengeDone = () => play([659, 880, 1175], 0.08, 0.3, 0.07)
export const playAchievement = () => play([784, 988, 1175, 1568], 0.07, 0.35, 0.07)
export const playXpTick = () => play([1200], 0, 0.03, 0.02, 'square')
