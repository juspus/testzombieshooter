import { useLayoutEffect, useRef } from 'react'
import { bakeStatic } from '../staticMerge'

// Dev / preview only: ?nobake leaves the scene unmerged, for A/B comparisons (same gate as ?nofx).
const BAKE_OFF = import.meta.env.VITE_VERCEL_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nobake')

// Wraps a block of static scene JSX. Right after mount its meshes are merged per material (once,
// see src/staticMerge.js) and the matrices of what is left are frozen. Put anything that animates,
// toggles, or mounts later (planks, glass, doors, lights that move) OUTSIDE this wrapper.
export default function StaticBake({ children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || BAKE_OFF) return undefined
    const { undo, stats } = bakeStatic(root)
    if (import.meta.env.DEV && typeof window !== 'undefined') window.__staticBake = { ...(window.__staticBake || {}), [root.uuid]: stats }
    return undo
  }, [])
  return <group ref={ref}>{children}</group>
}
