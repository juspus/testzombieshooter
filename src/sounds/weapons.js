// Guns, reloads, melee, flamethrower, crossbow and grenades (local and the partner's).
import { _makeShotChain, ctx, mechanicalClick, noiseBuffer, playNoise, playTone } from './core'
import { _makeSpatialOutput, _zombieOutput } from './spatial'

// ─── public sounds ───────────────────────────────────────────────────────────

// ─── per-weapon gunshot implementations ─────────────────────────────────────

// Glock 17 / 9mm pistol
// A real pistol shot is dominated by 150–400 Hz — heavy, guttural, slow to decay.
// The "snare" mistake is too much 2–5 kHz (snare wire territory) and no sustained
// low-mid body. This version leads with the gut and keeps HF as a subtle top-layer.
function _playPistolShot(ac, t, dest = null) {
  // Saturation + compression chain for all blast layers.
  // Drive 2.5 = strong harmonic spreading into the low-mids;
  // threshold -12 / ratio 6:1 compresses hard so the body stays fat.
  const chain = _makeShotChain(ac, 2.5, -12, dest)

  // 1. Sub-bass punch — felt pressure impact, 70→28 Hz, 35 ms.
  //    Saturation spreads harmonics upward, filling 70–200 Hz.
  const subOsc = ac.createOscillator()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(70, t)
  subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.035)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(3.0, t)
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.042)
  subOsc.connect(subGain)
  subGain.connect(chain)
  subOsc.start(t)
  subOsc.stop(t + 0.045)

  // 2. Guttural body — the core of the pistol "BANG".
  //    Wide bandpass (Q 0.6) centred at 200 Hz, decays slowly over 200 ms.
  //    This is what distinguishes a pistol from a snare.
  //    No 2.5 kHz peaking — that was the snare wire rattle.
  const bodyBuf = noiseBuffer(ac, 0.25)
  const bodySrc = ac.createBufferSource()
  bodySrc.buffer = bodyBuf
  const bodyFilt = ac.createBiquadFilter()
  bodyFilt.type = 'bandpass'
  bodyFilt.frequency.value = 200
  bodyFilt.Q.value = 0.6          // wide Q → broad low-mid energy
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(3.5, t)
  bodyGain.gain.exponentialRampToValueAtTime(0.4, t + 0.035)
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20)
  bodySrc.connect(bodyFilt)
  bodyFilt.connect(bodyGain)
  bodyGain.connect(chain)
  bodySrc.start(t)
  bodySrc.stop(t + 0.22)

  // 3. Bark layer — 380 Hz band, the "bark" on top of the body.
  //    Shorter than the body (80 ms), adds definition without becoming snare.
  const midBuf = noiseBuffer(ac, 0.12)
  const midSrc = ac.createBufferSource()
  midSrc.buffer = midBuf
  const midFilt = ac.createBiquadFilter()
  midFilt.type = 'bandpass'
  midFilt.frequency.value = 380
  midFilt.Q.value = 0.9
  const midGain = ac.createGain()
  midGain.gain.setValueAtTime(2.2, t)
  midGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085)
  midSrc.connect(midFilt)
  midFilt.connect(midGain)
  midGain.connect(chain)
  midSrc.start(t)
  midSrc.stop(t + 0.09)

  // 4. Initial crack transient — very brief HP burst above 1.2 kHz.
  //    Kept subtle (gain 1.0, 16 ms) so it gives edge not snare.
  const crackBuf = noiseBuffer(ac, 0.018)
  const crackSrc = ac.createBufferSource()
  crackSrc.buffer = crackBuf
  const crackHP = ac.createBiquadFilter()
  crackHP.type = 'highpass'
  crackHP.frequency.value = 1200  // not 4.2 kHz — that was the snare crack
  const crackGain = ac.createGain()
  crackGain.gain.setValueAtTime(1.0, t)
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.016)
  crackSrc.connect(crackHP)
  crackHP.connect(crackGain)
  crackGain.connect(chain)
  crackSrc.start(t)
  crackSrc.stop(t + 0.018)

  // 5. Room resonance tail — low-freq bloom, delayed onset (room fills).
  //    130 Hz bandpass, rises 0→25 ms then decays over 280 ms.
  //    Goes dry to destination — the tail shouldn't be re-saturated.
  const roomBuf = noiseBuffer(ac, 0.35)
  const roomSrc = ac.createBufferSource()
  roomSrc.buffer = roomBuf
  const roomFilt = ac.createBiquadFilter()
  roomFilt.type = 'bandpass'
  roomFilt.frequency.value = 130
  roomFilt.Q.value = 1.2
  const roomGain = ac.createGain()
  roomGain.gain.setValueAtTime(0.001, t)
  roomGain.gain.linearRampToValueAtTime(0.55, t + 0.025)  // room builds up
  roomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.30)
  roomSrc.connect(roomFilt)
  roomFilt.connect(roomGain)
  roomGain.connect(dest ?? ac.destination)
  roomSrc.start(t)
  roomSrc.stop(t + 0.32)

  // 6. Slide cycling back (~78 ms) — mechanical, dry
  const slideBackBuf = noiseBuffer(ac, 0.032)
  playNoise(ac, slideBackBuf, t + 0.076, 0.030, 0.48, 'bandpass', 2700, 4.5, dest)
  playTone(ac, t + 0.076, 165, 82, 0.028, 0.30, dest)

  // 7. Slide snapping forward + chambering (~118 ms)
  const slideFwdBuf = noiseBuffer(ac, 0.026)
  playNoise(ac, slideFwdBuf, t + 0.116, 0.024, 0.58, 'bandpass', 3300, 5.5, dest)
  playTone(ac, t + 0.116, 205, 100, 0.022, 0.36, dest)
}

// 12-gauge pump shotgun — cannon
// No saturation chain: WaveShaper at drive 3 converts 60-120 Hz content
// into midrange harmonics, killing the guttural low body.
// Clean routing + sawtooth growl + setTargetAtTime sustained decay.
function _playShotgunShot(ac, t, dest = null) {
  // All layers → out(0.55) → limiter → destination.
  // out.gain 0.55 keeps shotgun noticeably louder than pistol while
  // the limiter prevents hard clipping.
  const out = ac.createGain()
  out.gain.value = 0.55

  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value     = 1
  limiter.ratio.value    = 20
  limiter.attack.value   = 0.002
  limiter.release.value  = 0.200
  out.connect(limiter)
  limiter.connect(dest ?? ac.destination)

  // 1. Sub hit — 60→25 Hz clean sine, 95 ms.
  //    Clean sine = no midrange artifacts from saturation.
  const subOsc = ac.createOscillator()
  subOsc.type = 'sine'
  subOsc.frequency.setValueAtTime(60, t)
  subOsc.frequency.exponentialRampToValueAtTime(25, t + 0.095)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(4.0, t)
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.105)
  subOsc.connect(subGain)
  subGain.connect(out)
  subOsc.start(t)
  subOsc.stop(t + 0.110)

  // 2. Sawtooth growl — 55→22 Hz, LP 220 Hz, τ=150 ms (shorter, punchier).
  //    Harmonics at 55, 110, 165, 220 Hz give the "grrr" cannon texture.
  const growlOsc = ac.createOscillator()
  growlOsc.type = 'sawtooth'
  growlOsc.frequency.setValueAtTime(55, t)
  growlOsc.frequency.exponentialRampToValueAtTime(22, t + 0.200)
  const growlFilt = ac.createBiquadFilter()
  growlFilt.type = 'lowpass'
  growlFilt.frequency.value = 220
  const growlGain = ac.createGain()
  growlGain.gain.setValueAtTime(3.2, t)
  growlGain.gain.setTargetAtTime(0.001, t, 0.15)
  growlOsc.connect(growlFilt)
  growlFilt.connect(growlGain)
  growlGain.connect(out)
  growlOsc.start(t)
  growlOsc.stop(t + 0.320)

  // 3. Core boom body — 85 Hz, Q 0.40 (covers 45–160 Hz).
  //    τ=130 ms: punchy bloom that clears by ~400 ms.
  const bodyBuf = noiseBuffer(ac, 0.55)
  const bodySrc = ac.createBufferSource()
  bodySrc.buffer = bodyBuf
  const bodyFilt = ac.createBiquadFilter()
  bodyFilt.type = 'bandpass'
  bodyFilt.frequency.value = 85
  bodyFilt.Q.value = 0.40
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(4.5, t)
  bodyGain.gain.setTargetAtTime(0.001, t + 0.040, 0.130)
  bodySrc.connect(bodyFilt)
  bodyFilt.connect(bodyGain)
  bodyGain.connect(out)
  bodySrc.start(t)
  bodySrc.stop(t + 0.560)

  // 4. Upper body — 220 Hz, 180 ms.
  const upBuf = noiseBuffer(ac, 0.20)
  const upSrc = ac.createBufferSource()
  upSrc.buffer = upBuf
  const upFilt = ac.createBiquadFilter()
  upFilt.type = 'bandpass'
  upFilt.frequency.value = 220
  upFilt.Q.value = 0.8
  const upGain = ac.createGain()
  upGain.gain.setValueAtTime(2.5, t)
  upGain.gain.exponentialRampToValueAtTime(0.001, t + 0.180)
  upSrc.connect(upFilt)
  upFilt.connect(upGain)
  upGain.connect(out)
  upSrc.start(t)
  upSrc.stop(t + 0.200)

  // 5. Bark — 300 Hz, 140 ms. Fills the 250–400 Hz gap that was "empty".
  //    This is the primary "presence" band that makes the shot feel full.
  const barkBuf = noiseBuffer(ac, 0.16)
  const barkSrc = ac.createBufferSource()
  barkSrc.buffer = barkBuf
  const barkFilt = ac.createBiquadFilter()
  barkFilt.type = 'bandpass'
  barkFilt.frequency.value = 300
  barkFilt.Q.value = 0.9
  const barkGain = ac.createGain()
  barkGain.gain.setValueAtTime(3.5, t)
  barkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.140)
  barkSrc.connect(barkFilt)
  barkFilt.connect(barkGain)
  barkGain.connect(out)
  barkSrc.start(t)
  barkSrc.stop(t + 0.155)

  // 6. Mid burst — 620 Hz, 55 ms. Fills 500–750 Hz gap for density.
  const midBuf = noiseBuffer(ac, 0.065)
  playNoise(ac, midBuf, t, 0.050, 2.2, 'bandpass', 620, 1.2, out)

  // 7. Pellet spray — 950 Hz, 32 ms. Shotgun "crack" texture, boosted.
  const sprayBuf = noiseBuffer(ac, 0.036)
  playNoise(ac, sprayBuf, t, 0.030, 2.2, 'bandpass', 950, 1.0, out)

  // 8. Muzzle crack — HP 1.5 kHz, 18 ms. Sharp edge on the initial transient.
  const crackBuf = noiseBuffer(ac, 0.020)
  playNoise(ac, crackBuf, t, 0.016, 2.2, 'highpass', 1500, 0.8, out)

  // 9. Room tail — 75 Hz, fills in 30 ms, τ=180 ms. ~550 ms total.
  //    Shorter than before — cabin shake, not a reverb cathedral.
  const roomBuf = noiseBuffer(ac, 0.55)
  const roomSrc = ac.createBufferSource()
  roomSrc.buffer = roomBuf
  const roomFilt = ac.createBiquadFilter()
  roomFilt.type = 'bandpass'
  roomFilt.frequency.value = 75
  roomFilt.Q.value = 0.9
  const roomGain = ac.createGain()
  roomGain.gain.setValueAtTime(0.001, t)
  roomGain.gain.linearRampToValueAtTime(2.5, t + 0.030)
  roomGain.gain.setTargetAtTime(0.001, t + 0.030, 0.180)
  roomSrc.connect(roomFilt)
  roomFilt.connect(roomGain)
  roomGain.connect(out)
  roomSrc.start(t)
  roomSrc.stop(t + 0.55)
}

// Generic fallback (used while other weapon sounds are not yet implemented)
function _playGenericShot(ac, t, dest = null) {
  const crackBuf = noiseBuffer(ac, 0.18)
  const crack = ac.createBufferSource()
  crack.buffer = crackBuf

  const crackFilt = ac.createBiquadFilter()
  crackFilt.type = 'peaking'
  crackFilt.frequency.value = 1800
  crackFilt.gain.value = 12

  const crackGain = ac.createGain()
  crackGain.gain.setValueAtTime(1.1, t)
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)

  crack.connect(crackFilt)
  crackFilt.connect(crackGain)
  crackGain.connect(dest ?? ac.destination)
  crack.start(t)
  crack.stop(t + 0.18)

  playTone(ac, t, 220, 35, 0.12, 1.2, dest)
  playTone(ac, t + 0.02, 80, 30, 0.1, 0.5, dest)
}

export function playGunshot(weapon = 'pistol', upgraded = false) {
  const ac = ctx()
  const t  = ac.currentTime
  if (weapon === 'crossbow') _playCrossbowShot(ac, t)
  else if (weapon === 'pistol')  _playPistolShot(ac, t)
  else if (weapon === 'shotgun') _playShotgunShot(ac, t)
  else _playGenericShot(ac, t)
  if (upgraded) _playUpgradedLayer(ac, t)
}

export function playEmptyClick() {
  const ac = ctx()
  mechanicalClick(ac, ac.currentTime, 0.35)
}

export function playReload() {
  const ac = ctx()
  const t = ac.currentTime

  // 1. Magazine release — dull thud + rattle
  const rattleBuf = noiseBuffer(ac, 0.12)
  playNoise(ac, rattleBuf, t, 0.1, 0.45, 'bandpass', 900, 1.5)
  playTone(ac, t, 120, 55, 0.08, 0.3)

  // 2. Magazine seat — firm click at ~0.45 s
  mechanicalClick(ac, t + 0.45, 0.7)

  // 3. Slide rack — swoosh then snap at ~0.85 s
  const swBuf = noiseBuffer(ac, 0.2)
  const swSrc = ac.createBufferSource()
  swSrc.buffer = swBuf

  const swFilt = ac.createBiquadFilter()
  swFilt.type = 'bandpass'
  swFilt.frequency.setValueAtTime(1200, t + 0.85)
  swFilt.frequency.exponentialRampToValueAtTime(300, t + 1.0)
  swFilt.Q.value = 1.2

  const swGain = ac.createGain()
  swGain.gain.setValueAtTime(0.5, t + 0.85)
  swGain.gain.exponentialRampToValueAtTime(0.001, t + 1.05)

  swSrc.connect(swFilt)
  swFilt.connect(swGain)
  swGain.connect(ac.destination)
  swSrc.start(t + 0.85)
  swSrc.stop(t + 1.05)

  mechanicalClick(ac, t + 1.0, 0.6)
}

export function playPumpAction() {
  const ac = ctx()
  const t = ac.currentTime

  // "chik" — slide racking back: tight high snap at 3.8 kHz, 22 ms.
  // No low tones — those were making it sound clunky.
  const c1 = noiseBuffer(ac, 0.026)
  playNoise(ac, c1, t, 0.022, 0.80, 'bandpass', 3800, 7.0)

  // "chik" — slamming forward: slightly heavier snap at 3.2 kHz, 22 ms.
  const c2 = noiseBuffer(ac, 0.026)
  playNoise(ac, c2, t + 0.110, 0.022, 1.05, 'bandpass', 3200, 6.5)
  // Hard lock click as bolt seats — gives the definitive end of the stroke.
  mechanicalClick(ac, t + 0.133, 0.70)
}

export function playShellThonk() {
  const ac = ctx()
  const t = ac.currentTime

  // Hollow plastic thud — empty shell tube hitting floor
  const thud = noiseBuffer(ac, 0.08)
  playNoise(ac, thud, t, 0.07, 0.6, 'bandpass', 420, 2.5)
  playTone(ac, t, 320, 140, 0.06, 0.35)

  // Short hollow resonance — the tube body ringing
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(480 + Math.random() * 60, t + 0.01)
  osc.frequency.exponentialRampToValueAtTime(260, t + 0.09)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.18, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t + 0.01)
  osc.stop(t + 0.11)
}

export function playKnifeSwing(dest = null) {
  const ac = ctx()
  const t = ac.currentTime

  // Blade whoosh — bandpass noise sweeping upward then decaying
  const buf = noiseBuffer(ac, 0.20)
  const src = ac.createBufferSource()
  src.buffer = buf
  const filt = ac.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.setValueAtTime(600, t)
  filt.frequency.exponentialRampToValueAtTime(3200, t + 0.08)
  filt.frequency.exponentialRampToValueAtTime(500, t + 0.20)
  filt.Q.value = 2.5
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.45, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
  src.connect(filt)
  filt.connect(gain)
  gain.connect(dest ?? ac.destination)
  src.start(t)
  src.stop(t + 0.22)

  // Metallic blade ring — thin high oscillator
  const osc = ac.createOscillator()
  osc.frequency.setValueAtTime(3800, t + 0.04)
  osc.frequency.exponentialRampToValueAtTime(1600, t + 0.18)
  const ringGain = ac.createGain()
  ringGain.gain.setValueAtTime(0.07, t + 0.04)
  ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20)
  osc.connect(ringGain)
  ringGain.connect(dest ?? ac.destination)
  osc.start(t + 0.04)
  osc.stop(t + 0.20)
}

// ─── flamethrower ────────────────────────────────────────────────────────────

let _flameNodes = null

/// Continuous gas-jet roar: filtered noise loop + low rumble + hissing top end.
// start/stop pair — call start while the trigger is held, stop on release.
export function startFlamethrowerSound() {
  if (_flameNodes) return
  const ac = ctx()
  const t = ac.currentTime

  const out = ac.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(0.5, t + 0.08)
  out.connect(ac.destination)

  // Core roar — looping noise through a low bandpass, gives the "whoosh" body
  const roarBuf = noiseBuffer(ac, 1.0)
  const roarSrc = ac.createBufferSource()
  roarSrc.buffer = roarBuf
  roarSrc.loop = true
  const roarFilt = ac.createBiquadFilter()
  roarFilt.type = 'bandpass'
  roarFilt.frequency.value = 320
  roarFilt.Q.value = 0.7
  const roarGain = ac.createGain()
  roarGain.gain.value = 0.9
  roarSrc.connect(roarFilt)
  roarFilt.connect(roarGain)
  roarGain.connect(out)
  roarSrc.start(t)

  // Hiss — high-frequency noise loop for the gas jet edge
  const hissBuf = noiseBuffer(ac, 1.0)
  const hissSrc = ac.createBufferSource()
  hissSrc.buffer = hissBuf
  hissSrc.loop = true
  const hissFilt = ac.createBiquadFilter()
  hissFilt.type = 'highpass'
  hissFilt.frequency.value = 2600
  const hissGain = ac.createGain()
  hissGain.gain.value = 0.18
  hissSrc.connect(hissFilt)
  hissFilt.connect(hissGain)
  hissGain.connect(out)
  hissSrc.start(t)

  // Low rumble — gives the spray weight
  const rumble = ac.createOscillator()
  rumble.type = 'sawtooth'
  rumble.frequency.value = 48
  const rumbleFilt = ac.createBiquadFilter()
  rumbleFilt.type = 'lowpass'
  rumbleFilt.frequency.value = 140
  const rumbleGain = ac.createGain()
  rumbleGain.gain.value = 0.35
  rumble.connect(rumbleFilt)
  rumbleFilt.connect(rumbleGain)
  rumbleGain.connect(out)
  rumble.start(t)

  // Slow flicker LFO on overall gain so the roar isn't perfectly static
  const lfo = ac.createOscillator()
  lfo.frequency.value = 7
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 0.06
  lfo.connect(lfoGain)
  lfoGain.connect(out.gain)
  lfo.start(t)

  _flameNodes = { out, roarSrc, hissSrc, rumble, lfo }
}

export function stopFlamethrowerSound() {
  if (!_flameNodes) return
  const ac = ctx()
  const t = ac.currentTime
  const { out, roarSrc, hissSrc, rumble, lfo } = _flameNodes
  _flameNodes = null

  out.gain.cancelScheduledValues(t)
  out.gain.setValueAtTime(out.gain.value, t)
  out.gain.linearRampToValueAtTime(0, t + 0.12)

  setTimeout(() => {
    try { roarSrc.stop() } catch (_) {}
    try { hissSrc.stop() } catch (_) {}
    try { rumble.stop() } catch (_) {}
    try { lfo.stop() } catch (_) {}
    out.disconnect()
  }, 200)
}

// Play a weapon-specific gunshot coming from the remote player's world position.
export function playRemoteGunshot(weapon, x, y, z, upgraded = false) {
  const ac   = ctx()
  const t    = ac.currentTime
  const dest = _makeSpatialOutput(ac, x, y, z)
  if (weapon === 'crossbow') _playCrossbowShot(ac, t, dest)
  else if (weapon === 'pistol')  _playPistolShot(ac, t, dest)
  else if (weapon === 'shotgun') _playShotgunShot(ac, t, dest)
  else _playGenericShot(ac, t, dest)   // ak47 / deagle fallback
  if (upgraded) _playUpgradedLayer(ac, t, dest)
}

export function playRemoteKnifeSwing(x, y, z) {
  const ac   = ctx()
  const dest = _makeSpatialOutput(ac, x, y, z)
  playKnifeSwing(dest)
}


// ── Wave 3 grenades ──────────────────────────────────────────────────────────
// Pin pull: metal ping + click
export function playGrenadePin() {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 2400, 1800, 0.07, 0.12)
  playNoise(ac, noiseBuffer(ac, 0.05), t + 0.02, 0.04, 0.3, 'highpass', 3000, 1)
}

// Cook tick (urgency 0..1 raises the pitch as the fuse runs down)
export function playGrenadeTick(urgency = 0) {
  const ac = ctx()
  const t = ac.currentTime
  playTone(ac, t, 1500 + urgency * 1100, 1300 + urgency * 900, 0.04, 0.16)
}

// Spoon-off throw whoosh
export function playGrenadeThrow() {
  const ac = ctx()
  const t = ac.currentTime
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 0.22)
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'; f.Q.value = 1.2
  f.frequency.setValueAtTime(300, t)
  f.frequency.exponentialRampToValueAtTime(1100, t + 0.16)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.22, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
  src.connect(f); f.connect(g); g.connect(ac.destination)
  src.start(t); src.stop(t + 0.22)
}

// Metallic clunk when the grenade lands / bounces (positional)
export function playGrenadeBounce(x, y, z, strength = 1) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playTone(ac, t, 900, 420, 0.07, 0.16 * strength, dest)
  playNoise(ac, noiseBuffer(ac, 0.05), t, 0.04, 0.18 * strength, 'bandpass', 2600, 2, dest)
}

// Frag detonation: bigger and lower than the exploder burst, with a crack and a rumble tail
export function playGrenadeBoom(x, y, z) {
  const ac = ctx()
  const t = ac.currentTime
  const dest = _zombieOutput(ac, x, y, z)
  playNoise(ac, noiseBuffer(ac, 1.0), t, 0.9, 1.0, 'lowpass', 520, 0.8, dest)
  playTone(ac, t, 95, 22, 0.8, 1.0, dest)
  playNoise(ac, noiseBuffer(ac, 0.3), t, 0.2, 0.7, 'bandpass', 2600, 1.2, dest)
  playNoise(ac, noiseBuffer(ac, 0.5), t + 0.12, 0.45, 0.35, 'lowpass', 300, 0.7, dest)
}

// ─── Wave 3: Mystery Box, Upgrade Bench, crossbow ───────────────────────────

// Crossbow: no muzzle blast. A taut string "thwack" (low twang + wooden slap) and a thin whistle.
function _playCrossbowShot(ac, t, dest = null) {
  playTone(ac, t, 210, 90, 0.14, 0.3, dest)                                   // string twang
  playNoise(ac, noiseBuffer(ac, 0.08), t, 0.05, 0.38, 'bandpass', 1400, 1.6, dest)   // limb slap
  playTone(ac, t + 0.012, 880, 340, 0.07, 0.12, dest)
  playNoise(ac, noiseBuffer(ac, 0.2), t + 0.02, 0.16, 0.06, 'highpass', 4500, 0.8, dest)   // bolt whistle
}

// Repeating crossbow reload: a ratchet crank (clicks speed up over the 1.8 s) + a final latch.
export function playCrossbowReload() {
  const ac = ctx()
  const t = ac.currentTime
  for (let i = 0; i < 9; i++) {
    const at = t + 0.15 + i * (0.15 - i * 0.006)
    mechanicalClick(ac, at, 0.35)
    playTone(ac, at, 260 + i * 25, 200 + i * 25, 0.035, 0.07)
  }
  playNoise(ac, noiseBuffer(ac, 0.5), t + 0.1, 1.2, 0.07, 'bandpass', 700, 1.2)   // winding rasp
  mechanicalClick(ac, t + 1.55, 0.8)
  playTone(ac, t + 1.55, 140, 70, 0.08, 0.25)
}

// Collecting a stuck bolt: one small click.
export function playBoltPickup() {
  const ac = ctx()
  const t = ac.currentTime
  mechanicalClick(ac, t, 0.4)
  playTone(ac, t + 0.01, 1300, 1700, 0.05, 0.06)
}

// Upgraded weapons: a bright metallic zing + high shimmer on top of the normal shot,
// so a Pack-a-Punched gun is recognisable by ear (also played for the co-op partner).
function _playUpgradedLayer(ac, t, dest = null) {
  playTone(ac, t, 1500, 3400, 0.16, 0.12, dest)
  playTone(ac, t + 0.02, 2250, 5100, 0.12, 0.05, dest)
  playNoise(ac, noiseBuffer(ac, 0.12), t, 0.1, 0.1, 'highpass', 5000, 0.8, dest)
}
