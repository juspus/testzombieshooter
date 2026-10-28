// Zombie Mail wiring: sending (store + versus channel), receiving, and the sender's toast.
// Every message carries the run seed and is ignored on a mismatch, so a late message from the
// previous match can never land in a rematch.
import { create } from 'zustand'
import { useGameStore } from './store'
import { isConnected } from './net'
import { sendVersus, onVersus } from './versus'
import { mailItem } from './mail'

export const TOAST_MS = 2000

/** One-line toast for the sender: { text, at } | null. */
export const useMailToast = create(() => ({ toast: null }))
let _toastTimer = null
export function showMailToast(text) {
  useMailToast.setState({ toast: { text, at: Date.now() } })
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => useMailToast.setState({ toast: null }), TOAST_MS)
}

/** Send one item to the rival. Returns true when it went out. */
export function sendMail(itemId) {
  const it = mailItem(itemId)
  if (!it) return false
  const st = useGameStore.getState()
  if (st.runMode !== 'versus' || !st.versus.linked || st.versus.result || st.phase === 'dead') return false
  if (!isConnected()) return false
  if (st.mail.meter < it.cost) { showMailToast(`Need ${it.cost}`); return false }
  const id = st.spendMail(it.id)
  if (!id) return false
  sendVersus('mail', { seed: st.versus.seed, id, item: it.id })
  showMailToast(`Sent: ${it.label}`)
  return true
}

/** Wire the incoming side; returns an unsubscribe. Called once from VersusNet. */
export function installMail() {
  return onVersus('mail', (d) => {
    if (!d || typeof d !== 'object') return
    const st = useGameStore.getState()
    if (d.seed !== st.versus.seed) return
    st.receiveMail({ id: d.id, item: d.item })
  })
}
