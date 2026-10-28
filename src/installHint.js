// "Add to Home Screen" tip, iOS Safari only. Pure helpers (unit-tested) + the once-per-device flag.
export const INSTALL_HINT_KEY = 'cabinInstallHintDismissed'

export function isIos({ ua = '', platform = '', maxTouchPoints = 0 } = {}) {
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

// Real Safari only, not a Chrome/Firefox/Edge/Opera shell or an in-app browser (those have no
// Add to Home Screen item).
export function isIosSafari(env = {}) {
  const ua = env.ua ?? ''
  if (!isIos(env)) return false
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter/.test(ua)) return false
  return /Safari\//.test(ua)
}

export function shouldShowInstallHint({ ua, platform, maxTouchPoints, standalone, dismissed }) {
  return isIosSafari({ ua, platform, maxTouchPoints }) && !standalone && !dismissed
}

export function readEnv() {
  if (typeof window === 'undefined') return { standalone: true, dismissed: true }
  let standalone = false
  let dismissed = false
  try { standalone = !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true) } catch { /* ignore */ }
  try { dismissed = window.localStorage?.getItem(INSTALL_HINT_KEY) === '1' } catch { /* ignore */ }
  return { ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, standalone, dismissed }
}

export function markInstallHintSeen() {
  try { window.localStorage?.setItem(INSTALL_HINT_KEY, '1') } catch { /* private mode */ }
}
