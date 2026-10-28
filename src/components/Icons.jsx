// Tiny inline SVG glyphs for the menus. No emoji / pictographic characters anywhere in the UI:
// iOS draws characters like the check, star and heart as colour emoji.
const base = { width: '1em', height: '1em', viewBox: '0 0 12 12', style: { flexShrink: 0, verticalAlign: '-0.12em' }, 'aria-hidden': true }

export function CheckIcon() {
  return (
    <svg {...base}>
      <path d="M1.5 6.5 4.6 9.5 10.5 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StarIcon({ filled = true }) {
  return (
    <svg {...base}>
      <path
        d="M6 .9 7.6 4.2 11.2 4.7 8.6 7.2 9.2 10.8 6 9.1 2.8 10.8 3.4 7.2.8 4.7 4.4 4.2Z"
        fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" strokeLinejoin="round"
      />
    </svg>
  )
}

// dir: 'up' | 'down' | 'right'
export function ChevronIcon({ dir = 'down' }) {
  const rot = dir === 'up' ? 180 : dir === 'right' ? -90 : 0
  return (
    <svg {...base}>
      <path d="M2.5 4.2 6 7.8 9.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        transform={`rotate(${rot} 6 6)`} />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-label="Locked" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="5" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" />
      <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" />
    </svg>
  )
}
