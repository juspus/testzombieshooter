export const mobileInput = {
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
  shootHeld: false,
  shootPressed: false,
  interactHeld: false,
  interactPressed: false,
  swapPressed: false,
  reloadPressed: false,
  autoShootHeld: false,
}

// ── Look sensitivity ─────────────────────────────────────────────────────────
//
// Touch look used to be one flat multiplier on every pixel of drag, so small
// corrections and fast flicks turned the camera at the same rate — precise
// aiming and quick turns fought each other no matter what the multiplier was
// set to. Instead we scale each touchmove sample by its own speed: slow drags
// (fine aim) get a lower multiplier, fast drags (flick turns) get a higher
// one. The user-facing sensitivity slider scales the whole curve up or down.

const SENSITIVITY_KEY = 'cabinMobileLookSensitivity'
const DEFAULT_SENSITIVITY = 1
const MIN_SENSITIVITY = 0.5
const MAX_SENSITIVITY = 2.5

function clampSensitivity(value) {
  return Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value))
}

function readStoredSensitivity() {
  if (typeof window === 'undefined') return DEFAULT_SENSITIVITY
  const raw = Number(window.localStorage?.getItem(SENSITIVITY_KEY))
  return Number.isFinite(raw) ? clampSensitivity(raw) : DEFAULT_SENSITIVITY
}

const sensitivityState = { value: readStoredSensitivity() }

export function getLookSensitivity() {
  return sensitivityState.value
}

export function setLookSensitivity(value) {
  sensitivityState.value = clampSensitivity(value)
  window.localStorage?.setItem(SENSITIVITY_KEY, String(sensitivityState.value))
}

const LOOK_BASE_SCALE = 0.006
const LOOK_MIN_MULT = 0.6   // multiplier applied to slow, precise drags
const LOOK_MAX_MULT = 1.8   // multiplier applied to fast flicks
const LOOK_ACCEL_RANGE = 18 // px in one touchmove sample where max mult is reached
const LOOK_ACCEL_POWER = 1.5

function curveMultiplier(absDelta) {
  const t = Math.min(1, absDelta / LOOK_ACCEL_RANGE)
  return LOOK_MIN_MULT + (LOOK_MAX_MULT - LOOK_MIN_MULT) * Math.pow(t, LOOK_ACCEL_POWER)
}

// Call once per touchmove sample with the raw pixel delta since the last
// sample (not the cumulative drag distance — the curve reacts to per-sample
// speed). Accumulates already-scaled radians for Player.jsx to consume.
export function addMobileLook(dx, dy) {
  const scale = LOOK_BASE_SCALE * sensitivityState.value
  mobileInput.lookDeltaX += dx * curveMultiplier(Math.abs(dx)) * scale
  mobileInput.lookDeltaY += dy * curveMultiplier(Math.abs(dy)) * scale
}

export function consumeMobileLook() {
  const look = {
    x: mobileInput.lookDeltaX,
    y: mobileInput.lookDeltaY,
  }
  mobileInput.lookDeltaX = 0
  mobileInput.lookDeltaY = 0
  return look
}

export function consumeMobilePressed() {
  const pressed = {
    shoot: mobileInput.shootPressed,
    interact: mobileInput.interactPressed,
    swap: mobileInput.swapPressed,
    reload: mobileInput.reloadPressed,
  }
  mobileInput.shootPressed = false
  mobileInput.interactPressed = false
  mobileInput.swapPressed = false
  mobileInput.reloadPressed = false
  return pressed
}

// Set to true by MobileControls when mobile controls are active
export const mobileState = { active: false }

export function resetMobileInput() {
  mobileInput.moveX = 0
  mobileInput.moveY = 0
  mobileInput.lookDeltaX = 0
  mobileInput.lookDeltaY = 0
  mobileInput.shootHeld = false
  mobileInput.shootPressed = false
  mobileInput.interactHeld = false
  mobileInput.interactPressed = false
  mobileInput.swapPressed = false
  mobileInput.reloadPressed = false
  mobileInput.autoShootHeld = false
}
