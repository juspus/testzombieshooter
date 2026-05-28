import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { mobileInput, mobileState, resetMobileInput } from '../mobileInput'

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

// How many pixels of movement turns a tap into a drag
const DRAG_THRESHOLD = 10

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

  // Joystick
  const movePointerRef = useRef(null)
  const stickCenterRef = useRef({ x: 0, y: 0 })

  // Look zone (primary finger — camera)
  const lookPointerRef = useRef(null)
  const lastLookRef = useRef({ x: 0, y: 0 })
  const lookStartRef = useRef({ x: 0, y: 0 })
  const lookBtnRef = useRef(null)      // which button was under the touch start (null = open area)
  const lookDraggedRef = useRef(false) // did the touch travel past DRAG_THRESHOLD?
  const holdTimerRef = useRef(null)    // setTimeout to activate held-fire after 60 ms
  const holdFiredRef = useRef(false)   // did the hold timer activate?

  // Shoot zone (secondary finger — fires independently while primary looks)
  const shootPointerRef = useRef(null)
  const shootStartRef = useRef({ x: 0, y: 0 })
  const shootDraggedRef = useRef(false)
  const shootHoldFiredRef = useRef(false)
  const shootHoldTimerRef = useRef(null)

  // Button element refs – used ONLY for getBoundingClientRect() hit testing.
  // The visual divs have pointer-events:none; the look zone handles all input.
  const shootBtnRef = useRef(null)
  const interactBtnRef = useRef(null)
  const reloadBtnRef = useRef(null)
  const swapBtnRef = useRef(null)

  const active = phase === 'playing' || phase === 'intermission'
  const showInteractHint = nearChest || nearWindowId >= 0
  const showInstallHint = !isStandalone && !installHintDismissed

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

  useEffect(() => {
    mobileState.active = isMobile && active && !shopOpen
  }, [isMobile, active, shopOpen])

  useEffect(() => () => {
    mobileState.active = false
    resetMobileInput()
    clearTimeout(holdTimerRef.current)
    clearTimeout(shootHoldTimerRef.current)
  }, [])

  const dismissInstallHint = () => {
    window.localStorage?.setItem('cabinInstallHintDismissed', '1')
    setInstallHintDismissed(true)
  }

  const touchGuards = useMemo(() => ({
    onContextMenu: (e) => e.preventDefault(),
    onPointerCancel: () => {
      movePointerRef.current = null
      lookPointerRef.current = null
      shootPointerRef.current = null
      clearTimeout(holdTimerRef.current)
      clearTimeout(shootHoldTimerRef.current)
      holdTimerRef.current = null
      shootHoldTimerRef.current = null
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

  if (!active) return null
  if (shopOpen) return <div style={{ ...styles.root, opacity: 0, pointerEvents: 'none' }} />

  // ── Joystick handlers ──────────────────────────────────────────────────────

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
    const rawX = (e.clientX - center.x) / 40
    const rawY = (e.clientY - center.y) / 40
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

  // ── Hit-test helper ────────────────────────────────────────────────────────

  function hitButton(x, y) {
    for (const [ref, id] of [
      [shootBtnRef, 'shoot'],
      [interactBtnRef, 'interact'],
      [reloadBtnRef, 'reload'],
      [swapBtnRef, 'swap'],
    ]) {
      const el = ref.current
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  // ── Look-zone handlers (cover the whole right half + button area) ──────────
  //
  // Design contract:
  //   • ANY drag → camera movement (regardless of where the touch started)
  //   • Touch starts on a button AND moves < DRAG_THRESHOLD → button tap
  //   • Touch starts on a held button AND stays stationary 60 ms → held-fire,
  //     but if it later drags the hold is cancelled and camera takes over
  //   • Touch starts in open space → pure camera look

  const cancelHold = () => {
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    mobileInput.shootHeld = false
    mobileInput.interactHeld = false
  }

  const cancelShootHold = () => {
    clearTimeout(shootHoldTimerRef.current)
    shootHoldTimerRef.current = null
    mobileInput.shootHeld = false
  }

  const onLookStart = (e) => {
    e.preventDefault()

    if (lookPointerRef.current === null) {
      // PRIMARY TOUCH — camera look
      e.currentTarget.setPointerCapture(e.pointerId)
      lookPointerRef.current = e.pointerId
      lastLookRef.current = { x: e.clientX, y: e.clientY }
      lookStartRef.current = { x: e.clientX, y: e.clientY }
      lookDraggedRef.current = false
      holdFiredRef.current = false
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null

      const hit = hitButton(e.clientX, e.clientY)
      lookBtnRef.current = hit

      // Schedule held-fire for shoot / interact buttons
      if (hit === 'shoot' || hit === 'interact') {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null
          if (lookDraggedRef.current) return
          holdFiredRef.current = true
          if (hit === 'shoot') {
            mobileInput.shootHeld = true
            mobileInput.shootPressed = true
          } else {
            mobileInput.interactHeld = true
            mobileInput.interactPressed = true
          }
        }, 60)
      }
    } else if (shootPointerRef.current === null) {
      // SECONDARY TOUCH — dedicated shoot finger (fires while primary looks)
      e.currentTarget.setPointerCapture(e.pointerId)
      shootPointerRef.current = e.pointerId
      shootStartRef.current = { x: e.clientX, y: e.clientY }
      shootDraggedRef.current = false
      shootHoldFiredRef.current = false

      shootHoldTimerRef.current = setTimeout(() => {
        shootHoldTimerRef.current = null
        if (shootDraggedRef.current) return
        shootHoldFiredRef.current = true
        mobileInput.shootHeld = true
        mobileInput.shootPressed = true
      }, 60)
    }
  }

  const onLookMove = (e) => {
    e.preventDefault()
    if (e.pointerId === lookPointerRef.current) {
      e.preventDefault()

      // Camera always moves on drag
      const last = lastLookRef.current
      mobileInput.lookDeltaX += e.clientX - last.x
      mobileInput.lookDeltaY += e.clientY - last.y
      lastLookRef.current = { x: e.clientX, y: e.clientY }

      // First time past threshold: mark as drag and cancel any button hold
      if (!lookDraggedRef.current) {
        const dx = e.clientX - lookStartRef.current.x
        const dy = e.clientY - lookStartRef.current.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          lookDraggedRef.current = true
          cancelHold()
        }
      }
    } else if (e.pointerId === shootPointerRef.current) {
      e.preventDefault()
      if (!shootDraggedRef.current) {
        const dx = e.clientX - shootStartRef.current.x
        const dy = e.clientY - shootStartRef.current.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          shootDraggedRef.current = true
          cancelShootHold()
        }
      }
    }
  }

  const onLookEnd = (e) => {
    if (e.pointerId === shootPointerRef.current) {
      // Secondary shoot finger lifted
      e.preventDefault()
      shootPointerRef.current = null
      clearTimeout(shootHoldTimerRef.current)
      shootHoldTimerRef.current = null
      mobileInput.shootHeld = false
      if (!shootDraggedRef.current && !shootHoldFiredRef.current) {
        mobileInput.shootPressed = true
      }
      shootDraggedRef.current = false
      shootHoldFiredRef.current = false
      return
    }

    if (e.pointerId !== lookPointerRef.current) return
    e.preventDefault()
    lookPointerRef.current = null
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null

    const hit = lookBtnRef.current
    const dragged = lookDraggedRef.current
    const holdFired = holdFiredRef.current

    // Release held buttons
    mobileInput.shootHeld = false
    mobileInput.interactHeld = false

    // Tap: finger up without dragging, and hold timer didn't already activate.
    // A tap on open space (hit === null) or the shoot button fires — any part of
    // the look zone counts as a shoot tap unless it's a utility button.
    if (!dragged && !holdFired) {
      if (hit === 'shoot' || hit === null) mobileInput.shootPressed = true
      else if (hit === 'interact') mobileInput.interactPressed = true
      else if (hit === 'reload') mobileInput.reloadPressed = true
      else if (hit === 'swap') mobileInput.swapPressed = true
    }

    lookBtnRef.current = null
    lookDraggedRef.current = false
    holdFiredRef.current = false
  }

  const onLookCancel = (e) => {
    if (e.pointerId === shootPointerRef.current) {
      shootPointerRef.current = null
      cancelShootHold()
      mobileInput.shootHeld = false
      shootDraggedRef.current = false
      shootHoldFiredRef.current = false
      return
    }
    if (e.pointerId !== lookPointerRef.current) return
    lookPointerRef.current = null
    cancelHold()
    lookBtnRef.current = null
    lookDraggedRef.current = false
    holdFiredRef.current = false
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const swapIcon = activeItem === 'gun' ? '🔪' : '🔫'

  return (
    <div style={styles.root} {...touchGuards}>
      {showInstallHint && (
        <div style={styles.installHint} onClick={dismissInstallHint}>
          <div>
            <div style={styles.installTitle}>FULLSCREEN MODE</div>
            <div style={styles.installText}>For more playable space in Safari: Share → Add to Home Screen, then launch Cabin from the icon.</div>
          </div>
          <button
            type="button"
            style={styles.installDismiss}
            onClick={(e) => { e.stopPropagation(); dismissInstallHint() }}
          >×</button>
        </div>
      )}

      {/* Left joystick */}
      <div
        style={styles.moveZone}
        onPointerDown={onMoveStart}
        onPointerMove={onMove}
        onPointerUp={onMoveEnd}
        onPointerCancel={onMoveEnd}
      >
        <div style={styles.stickBase}>
          <div style={{ ...styles.stickKnob, transform: `translate(${stick.x * 40}px, ${stick.y * 40}px)` }} />
        </div>
      </div>

      {/* Look zone — covers the entire right portion including the button area.
          All drag events here move the camera; button actions are triggered only
          by taps (or sustained holds) detected via hit-testing. */}
      <div
        style={styles.lookZone}
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookCancel}
      />

      {/* Visual-only button cluster — pointer-events:none, look zone handles input.
          Refs are used purely for getBoundingClientRect() hit testing above. */}
      <div style={styles.actions}>
        <div style={styles.actionsRow}>
          <div ref={reloadBtnRef} style={{ ...styles.roundBtn, ...styles.reloadBtn }}>↻</div>
          <div ref={swapBtnRef} style={{ ...styles.roundBtn, ...styles.swapBtn }}>{swapIcon}</div>
        </div>
        <div style={styles.actionsRow}>
          <div
            ref={interactBtnRef}
            style={{ ...styles.roundBtn, ...styles.interactBtn, ...(showInteractHint ? styles.interactActive : {}) }}
          >✋</div>
          <div ref={shootBtnRef} style={{ ...styles.roundBtn, ...styles.shootBtn }}>●</div>
        </div>
      </div>
    </div>
  )
}

const glass = {
  background: 'rgba(10, 12, 16, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 0 14px rgba(0,0,0,0.35)',
}

const styles = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 6,
    pointerEvents: 'none',
    touchAction: 'none',
    fontFamily: 'Courier New, monospace',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  moveZone: {
    position: 'absolute',
    left: 'max(14px, env(safe-area-inset-left))',
    bottom: 'max(14px, env(safe-area-inset-bottom))',
    width: 116,
    height: 116,
    borderRadius: 999,
    pointerEvents: 'auto',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickBase: {
    ...glass,
    width: 90,
    height: 90,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickKnob: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: 'rgba(220, 230, 240, 0.46)',
    border: '1px solid rgba(255,255,255,0.45)',
  },
  // Look zone covers everything right of the joystick area
  lookZone: {
    position: 'absolute',
    top: 0,
    left: 120,
    right: 0,
    bottom: 0,
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  // Button cluster — raised up from the bottom, pulled inward from right edge.
  // pointer-events:none — the look zone handles all input via hit testing.
  actions: {
    position: 'absolute',
    right: 'clamp(12px, 18vw, 170px)',
    bottom: 'clamp(50px, 15vh, 110px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 7,
    pointerEvents: 'none',
  },
  actionsRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  },
  // Base round button (visual only)
  roundBtn: {
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...glass,
    color: '#f4efe4',
    fontWeight: 'bold',
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    userSelect: 'none',
  },
  shootBtn: {
    width: 58,
    height: 58,
    fontSize: 24,
    background: 'rgba(120,20,8,0.68)',
    border: '2px solid rgba(255,100,60,0.6)',
    boxShadow: '0 0 18px rgba(180,40,20,0.45)',
    color: '#ffd6c0',
  },
  interactBtn: {
    width: 46,
    height: 46,
    fontSize: 20,
  },
  interactActive: {
    border: '1px solid rgba(255,200,50,0.7)',
    background: 'rgba(70,46,0,0.68)',
    boxShadow: '0 0 14px rgba(210,160,0,0.4)',
  },
  reloadBtn: {
    width: 36,
    height: 36,
    fontSize: 15,
    color: 'rgba(200,220,240,0.75)',
    background: 'rgba(8,12,22,0.55)',
  },
  swapBtn: {
    width: 36,
    height: 36,
    fontSize: 15,
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
    padding: '8px 12px',
    borderRadius: 10,
    background: 'rgba(0, 0, 0, 0.88)',
    border: '1px solid rgba(200, 128, 26, 0.55)',
    boxShadow: '0 0 20px rgba(0,0,0,0.45)',
    cursor: 'pointer',
  },
  installTitle: {
    color: '#c8801a',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  installText: {
    color: '#ddd',
    fontSize: 10,
    lineHeight: 1.35,
  },
  installDismiss: {
    width: 28,
    height: 28,
    flex: '0 0 auto',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#f4efe4',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
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
