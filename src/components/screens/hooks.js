// Account, profile and Stripe-return hooks for the menu screens.
import { useEffect, useState } from 'react'
import { useGameStore } from '../../store'
import { track } from '../../analytics'
import { SUPPORTER_SKU } from '../../cosmetics'
import { onAuthStateChange, getUser, getProfile, fetchEntitlements } from '../../supabase'

export function useAuthUser() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    getUser().then(setUser)
    return onAuthStateChange(setUser)
  }, [])
  return user
}

export function useProfile(user) {
  const [username, setUsername] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!user) { setUsername(null); return }
    setLoading(true)
    getProfile().then((p) => { setUsername(p?.username ?? null); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
  const refresh = () => getProfile().then((p) => setUsername(p?.username ?? null))
  return { username, loading, refresh }
}

// ── Stripe return (?checkout=success|cancel) ───────────────────────────────

function readCheckoutParam() {
  if (typeof window === 'undefined') return null
  try {
    const c = new URLSearchParams(window.location.search).get('checkout')
    return c === 'success' || c === 'cancel' ? c : null
  } catch {
    return null
  }
}

function stripCheckoutParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('checkout')
    url.searchParams.delete('session_id')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch { /* cosmetic only */ }
}

let checkoutHandled = false  // module-level so React StrictMode's double effect doesn't double-track
const POLL_EVERY_MS = 1500
const POLL_MAX_ATTEMPTS = 8

/**
 * On return from Stripe: poll entitlements (the webhook may lag the redirect)
 * until the supporter pack shows up. Returns the locker notice (or null).
 * The initial value comes from the URL, so StartScreen can open the locker on first render.
 */
export function useCheckoutReturn() {
  const [checkout] = useState(readCheckoutParam)
  const [notice, setNotice] = useState(checkout === 'success' ? 'Confirming your purchase…' : null)
  useEffect(() => {
    if (!checkout || checkoutHandled) return
    checkoutHandled = true
    if (checkout === 'cancel') {
      track('checkout_cancel')
      stripCheckoutParams()
      return
    }
    track('checkout_success')
    ;(async () => {
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        try {
          const list = await fetchEntitlements()
          if (list.includes(SUPPORTER_SKU)) {
            useGameStore.getState().setEntitlements(list)
            setNotice('Supporter Pack unlocked')
            stripCheckoutParams()
            return
          }
        } catch (err) {
          console.warn('[checkout] entitlement poll failed', err)
        }
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS))
      }
      setNotice('Payment received — your Supporter Pack can take a minute to appear. Reopen the locker shortly.')
      stripCheckoutParams()
    })()
  }, [checkout])
  return { openLocker: checkout === 'success', notice }
}
