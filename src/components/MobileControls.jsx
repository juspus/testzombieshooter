import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { mobileInput, resetMobileInput } from '../mobileInput'

function getIsMobile() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

function getIsPortrait() {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

function getIsStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

function getInstallHintDismissed() {
  if (typeof window === 'undefined') return false
  return window.localStorage?.getItem('cabinInstallHintDismissed') === '1'
}

function clampVector(x, y) {
  const length = Math.hypot(x, y)
  if (length <= 1) return { x, y }
  return { x: x / length, y: y / length }
}

export default function MobileControls() {
  const phase = useGameStore((s) => s.phase)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const activeItem = useGameStore((s) => s.activeItem)
  const nearChest = useGameStore((s) => s.nearChest)
  const nearWindowId = useGameStore((s) => s.nearWindowId)
  const [isMobile, setIsMobile] = useState(getIsMobile)
  const [isPortrait, setIsPortrait] = useState(getIsPortrait)
  const [isStandalone, setIsStandalone] = useState(getIsStandalone)
  const [installHintDismissed, setInstallHintDismissed] = useState(getInstallHintDismissed)
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const movePointerRef = useRef(null)
  const lookPointerRef = useRef(null)
  const stickCenterRef = useRef({ x: 0, y: 0 })
  const lastLookRef = useRef({ x: 0, y: 0 })
  const active = phase === 'playing' || phase === 'intermission'

  useEffect(() => {
    const update = () => {
      setIsMobile(getIsMobile())
      setIsPortrait(getIsPortrait())
      setIsStandalone(getIsStandalone())
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

  useEffect(() => {
    if (!isMobile || !active || shopOpen) resetMobileInput()
  }, [isMobile, active, shopOpen])

  useEffect(() => () => resetMobileInput(), [])

  const showInteractHint = nearChest || nearWindowId >= 0
  const swapLabel = activeItem === 'gun' ? 'KNIFE' : 'GUN'
  const showInstallHint = !isStandalone && !installHintDismissed

  const dismissInstallHint = () => {
    window.localStorage?.setItem('cabinInstallHintDismissed', '1')
    setInstallHintDismissed(true)
  }

  const touchGuards = useMemo(() => ({
    onContextMenu: (e) => e.preventDefault(),
    onPointerCancel: () => {
      movePointerRef.current = null
      lookPointerRef.current = null
      resetMobileInput()
      setStick({ x: 0, y: 0 })
    },
  }), [])

  if (!isMobile) return null

  if (isPortrait) {
    return (
      <div style={styles.rotateOverlay}>
        <div style={styles.rotateIcon}>↻</div>
        <div style={styles.rotateTitle}>ROTATE DEVICE</div>
        <div style={styles.rotateText}>Cabin mobile controls require landscape mode.</div>
      </div>
    )
  }

  if (!active || shopOpen) return null

  const onMoveStart = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    movePointerRef.current = e.pointerId
    const rect = e.currentTarget.getBoundingClientRect()
    stickCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    onMove(e)
  }

  const onMove = (e) => {
    if (movePointerRef.current !== e.pointerId) return
    e.preventDefault()
    const center = stickCenterRef.current
    const rawX = (e.clientX - center.x) / 54
    const rawY = (e.clientY - center.y) / 54
    const clamped = clampVector(rawX, rawY)
    mobileInput.moveX = clamped.x
    mobileInput.moveY = -clamped.y
    setStick(clamped)
  }

  const onMoveEnd = (e) => {
    if (movePointerRef.current !== e.pointerId) return
    e.preventDefault()
    movePointerRef.current = null
    mobileInput.moveX = 0
    mobileInput.moveY = 0
    setStick({ x: 0, y: 0 })
  }

  const onLookStart = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    lookPointerRef.current = e.pointerId
    lastLookRef.current = { x: e.clientX, y: e.clientY }
  }

  const onLookMove = (e) => {
    if (lookPointerRef.current !== e.pointerId) return
    e.preventDefault()
    const last = lastLookRef.current
    mobileInput.lookDeltaX += e.clientX - last.x
    mobileInput.lookDeltaY += e.clientY - last.y
    lastLookRef.current = { x: e.clientX, y: e.clientY }
  }

  const onLookEnd = (e) => {
    if (lookPointerRef.current !== e.pointerId) return
    e.preventDefault()
    lookPointerRef.current = null
  }

  const actionButton = (label, handlers, extraStyle = {}) => (
    <button
      type="button"
      style={{ ...styles.actionButton, ...extraStyle }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        handlers.down?.()
      }}
      onPointerUp={(e) => {
        e.preventDefault()
        handlers.up?.()
      }}
      onPointerCancel={(e) => {
        e.preventDefault()
        handlers.up?.()
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={styles.root} {...touchGuards}>
      {showInstallHint && (
        <div style={styles.installHint}>
          <div>
            <div style={styles.installTitle}>FULLSCREEN MODE</div>
            <div style={styles.installText}>For more playable space in Safari: Share → Add to Home Screen, then launch Cabin from the icon.</div>
          </div>
          <button type="button" style={styles.installDismiss} onPointerDown={(e) => { e.preventDefault(); dismissInstallHint() }}>×</button>
        </div>
      )}

      <div
        style={styles.moveZone}
        onPointerDown={onMoveStart}
        onPointerMove={onMove}
        onPointerUp={onMoveEnd}
        onPointerCancel={onMoveEnd}
      >
        <div style={styles.stickBase}>
          <div style={{ ...styles.stickKnob, transform: `translate(${stick.x * 54}px, ${stick.y * 54}px)` }} />
        </div>
        <div style={styles.zoneLabel}>MOVE</div>
      </div>

      <div
        style={styles.lookZone}
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
      >
        <div style={styles.lookLabel}>DRAG TO LOOK</div>
      </div>

      <div style={styles.actions}>
        {actionButton('SHOOT', {
          down: () => {
            mobileInput.shootHeld = true
            mobileInput.shootPressed = true
          },
          up: () => {
            mobileInput.shootHeld = false
          },
        }, styles.shootButton)}
        {actionButton(showInteractHint ? 'INTERACT' : 'USE', {
          down: () => {
            mobileInput.interactHeld = true
            mobileInput.interactPressed = true
          },
          up: () => {
            mobileInput.interactHeld = false
          },
        })}
        {actionButton(swapLabel, {
          down: () => {
            mobileInput.swapPressed = true
          },
        })}
      </div>
    </div>
  )
}

const glass = {
  background: 'rgba(10, 12, 16, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 0 18px rgba(0,0,0,0.35)',
}

const styles = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 6,
    pointerEvents: 'none',
    touchAction: 'none',
    fontFamily: 'Courier New, monospace',
  },
  moveZone: {
    position: 'absolute',
    left: 'max(20px, env(safe-area-inset-left))',
    bottom: 'max(18px, env(safe-area-inset-bottom))',
    width: 150,
    height: 150,
    borderRadius: 999,
    pointerEvents: 'auto',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickBase: {
    ...glass,
    width: 118,
    height: 118,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickKnob: {
    width: 54,
    height: 54,
    borderRadius: 999,
    background: 'rgba(220, 230, 240, 0.46)',
    border: '1px solid rgba(255,255,255,0.45)',
  },
  zoneLabel: {
    position: 'absolute',
    bottom: -2,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 'bold',
  },
  lookZone: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '58vw',
    pointerEvents: 'auto',
    touchAction: 'none',
  },
  lookLabel: {
    position: 'absolute',
    right: 132,
    top: 18,
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 'bold',
  },
  actions: {
    position: 'absolute',
    right: 'max(18px, env(safe-area-inset-right))',
    bottom: 'max(18px, env(safe-area-inset-bottom))',
    display: 'grid',
    gridTemplateColumns: '74px 74px',
    gap: 10,
    pointerEvents: 'auto',
  },
  actionButton: {
    ...glass,
    height: 58,
    borderRadius: 14,
    color: '#f4efe4',
    fontFamily: 'Courier New, monospace',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    touchAction: 'none',
  },
  shootButton: {
    gridRow: 'span 2',
    height: 126,
    borderRadius: 18,
    color: '#ffd6c0',
    border: '1px solid rgba(255, 130, 90, 0.48)',
    background: 'rgba(80, 18, 12, 0.48)',
  },
  installHint: {
    position: 'absolute',
    top: 'max(10px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100vw - 28px))',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'rgba(0, 0, 0, 0.88)',
    border: '1px solid rgba(200, 128, 26, 0.55)',
    boxShadow: '0 0 24px rgba(0,0,0,0.45)',
  },
  installTitle: {
    color: '#c8801a',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  installText: {
    color: '#ddd',
    fontSize: 11,
    lineHeight: 1.35,
  },
  installDismiss: {
    width: 32,
    height: 32,
    flex: '0 0 auto',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#f4efe4',
    fontSize: 20,
    lineHeight: 1,
    touchAction: 'none',
  },
  rotateOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: '#020202',
    color: '#f4efe4',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    textAlign: 'center',
    fontFamily: 'Courier New, monospace',
    padding: 28,
  },
  rotateIcon: {
    fontSize: 64,
    lineHeight: 1,
    color: '#c8801a',
  },
  rotateTitle: {
    fontSize: 18,
    letterSpacing: 6,
    fontWeight: 'bold',
    color: '#c8801a',
  },
  rotateText: {
    maxWidth: 280,
    color: '#aaa',
    fontSize: 13,
    lineHeight: 1.5,
  },
}
