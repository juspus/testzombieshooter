// Device gate for cosmetic effects (corpses, blood). Mirrors the mobile
// detection used in HUD.jsx / MobileControls.jsx; evaluated once at load.
function detectMobile() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

export const FX_IS_MOBILE = detectMobile()

// Max settled zombie corpses kept on the floor (oldest removed first).
// Each corpse is a full mounted zombie body (~35 draw calls once its tiny
// decor meshes are hidden), so phones keep fewer.
export const MAX_CORPSES = FX_IS_MOBILE ? 6 : 12
