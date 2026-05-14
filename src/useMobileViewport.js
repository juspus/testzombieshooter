import { useEffect } from 'react'

function setViewportVars() {
  if (typeof window === 'undefined') return
  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-width', `${width}px`)
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

export default function useMobileViewport() {
  useEffect(() => {
    setViewportVars()

    window.addEventListener('resize', setViewportVars)
    window.addEventListener('orientationchange', setViewportVars)

    return () => {
      window.removeEventListener('resize', setViewportVars)
      window.removeEventListener('orientationchange', setViewportVars)
    }
  }, [])
}
