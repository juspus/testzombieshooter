// Shared touch/mobile device heuristic, used by HUD, MobileControls, and
// anything that needs to branch UI copy/layout on desktop vs. touch input.
export function isMobileDevice() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}
