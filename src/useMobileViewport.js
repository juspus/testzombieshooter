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

    const viewport = window.visualViewport
    window.addEventListener('resize', setViewportVars)
    window.addEventListener('orientationchange', setViewportVars)
    viewport?.addEventListener('resize', setViewportVars)
    viewport?.addEventListener('scroll', setViewportVars)

    return () => {
      window.removeEventListener('resize', setViewportVars)
      window.removeEventListener('orientationchange', setViewportVars)
      viewport?.removeEventListener('resize', setViewportVars)
      viewport?.removeEventListener('scroll', setViewportVars)
    }
  }, [])
}
