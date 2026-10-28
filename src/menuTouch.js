import { useEffect, useState } from 'react'

// Shared "is this a phone / is it upright" flags for the menu screens (start, locker, shop...).
// Same detection the rest of the UI uses: coarse pointer, or touch + a small screen.
export const MIN_TAP = 44

export function getIsTouchScreen() {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const small = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarse || (touchPoints && small))
}

export function getIsPortrait() {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

// { touch, portrait } - updates on resize / rotation.
export default function useMenuEnv() {
  const [env, setEnv] = useState(() => ({ touch: getIsTouchScreen(), portrait: getIsPortrait() }))
  useEffect(() => {
    const update = () => {
      const next = { touch: getIsTouchScreen(), portrait: getIsPortrait() }
      setEnv((cur) => (cur.touch === next.touch && cur.portrait === next.portrait ? cur : next))
    }
    const media = window.matchMedia?.('(hover: none) and (pointer: coarse)')
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    media?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      media?.removeEventListener?.('change', update)
    }
  }, [])
  return env
}
