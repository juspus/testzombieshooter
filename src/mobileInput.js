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
