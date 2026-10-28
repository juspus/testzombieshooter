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
  cyclePressed: false,   // Wave 3: cycle to the next carried gun (up to 3)
  autoShootHeld: false,
  grenadeHeld: false,   // hold to cook a frag grenade, release to throw
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
    cycle: mobileInput.cyclePressed,
  }
  mobileInput.shootPressed = false
  mobileInput.interactPressed = false
  mobileInput.swapPressed = false
  mobileInput.reloadPressed = false
  mobileInput.cyclePressed = false
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
  mobileInput.grenadeHeld = false
}

// Floating stick: ring radius (px of finger travel for full deflection) and dead zone
// (fraction of the radius). Output magnitude is analog: 0 inside the dead zone, then a linear
// ramp to 1 at the ring edge, so a light push walks and a full push runs.
export const STICK_RADIUS = 48
export const STICK_DEADZONE = 0.1
export function stickVector(dx, dy) {
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: 0, y: 0, mag: 0, knobX: 0, knobY: 0 }
  const raw = Math.min(1, len / STICK_RADIUS)
  const ux = dx / len
  const uy = dy / len
  const mag = raw < STICK_DEADZONE ? 0 : (raw - STICK_DEADZONE) / (1 - STICK_DEADZONE)
  return { x: ux * mag, y: uy * mag, mag, knobX: ux * raw, knobY: uy * raw }
}
