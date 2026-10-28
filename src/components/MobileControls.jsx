import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store'
import { mobileInput, mobileState, resetMobileInput, stickVector, STICK_RADIUS } from '../mobileInput'
import { useSettings, DEFAULT_BUTTON_OPACITY } from '../settings'
import { usePauseUi } from '../pause'
import { MAIL_ITEMS } from '../mail'
import { sendMail } from '../mailRuntime'

function getIsMobile() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

// Layout. All button geometry is in CSS px relative to the FIRE button centre (dx right, dy up),
// scaled by `k` for the large-buttons setting and mirrored for left-handed play.
export const HIT_PAD = 8                       // invisible ring around every button's drawn circle
const FIRE_R = 32
const USE_R = 26
const SMALL_R = 24
const CLUSTER_OFFS = {
  reload: [-87, -30],
  swap: [-72, 57],
  gren: [-11, 91],
  cycle: [47, 79],
  use: [-112, 116],
  mail: [-150, 10],      // Zombie Mail (versus only): left of RELOAD, clear of every other button
}
const ANCHOR_RIGHT = 84                        // FIRE centre to the screen edge (room for CYCLE + margin)
const ANCHOR_BOTTOM = 70
// The stick zone and the look zone share one edge: 40% of the screen plus the safe-area inset on
// the stick's side, so a notch never leaves the look zone under the stick.
const INSET_L = 'max(0px, env(safe-area-inset-left))'
const INSET_R = 'max(0px, env(safe-area-inset-right))'
const INSET_B = 'max(0px, env(safe-area-inset-bottom))'
export const stickZoneWidth = (leftHanded) => `calc(40% + ${leftHanded ? INSET_R : INSET_L})`
const STICK_TOP = 110                          // keep clear of the pause button and the HUD top

// How many pixels of movement turns a tap into a drag
const DRAG_THRESHOLD = 10

export default function MobileControls() {
  const phase = useGameStore((s) => s.phase)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const activeItem = useGameStore((s) => s.activeItem)
  const nearChest = useGameStore((s) => s.nearChest)
  const nearWindowId = useGameStore((s) => s.nearWindowId)
  const nearDoorId = useGameStore((s) => s.nearDoorId)
  const [isMobile, setIsMobile] = useState(getIsMobile)
  const [stick, setStick] = useState({ on: false, cx: 0, cy: 0, x: 0, y: 0 })
  const buttonSize = useSettings((s) => s.buttonSize)
  const buttonOpacity = useSettings((s) => s.buttonOpacity)
  const leftHanded = useSettings((s) => s.leftHanded)
  const paused = useGameStore((s) => s.paused)
  const pauseMenu = usePauseUi((s) => s.menu)
  const rootRef = useRef(null)

  // Joystick (floating: centre is wherever the thumb landed)
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
  // Wave 3 grenade button: own pointer (hold = cook, release = throw), never turns into a camera drag
  const grenBtnRef = useRef(null)
  const grenPointerRef = useRef(null)
  // USE button: own pointer too, so holding it (planks, doors, box, bench, revive) never takes the look finger
  const usePointerRef = useRef(null)
  const grenades = useGameStore((s) => s.grenades)
  // Zombie Mail (versus): MAIL button tracks its own pointer; its list is real DOM buttons above the look zone
  const mailBtnRef = useRef(null)
  const mailPointerRef = useRef(null)
  const [mailOpen, setMailOpen] = useState(false)
  const mailOn = useGameStore((s) => s.runMode === 'versus' && s.versus.active && s.versus.linked && !s.versus.result)
  const mailMeter = useGameStore((s) => s.mail?.meter ?? 0)
  const cycleBtnRef = useRef(null)
  const ownedCount = useGameStore((s) => s.ownedWeapons.length)

  const active = phase === 'playing' || phase === 'intermission'
  const nearMachine = useGameStore((s) => s.nearMachine)
  const nearDownedPartner = useGameStore((s) => s.coopNearPartner)   // W5: interact = revive
  const showInteractHint = nearChest || nearWindowId >= 0 || nearDoorId !== null || nearMachine !== null || nearDownedPartner

  useEffect(() => {
    const update = () => {
      setIsMobile(getIsMobile())
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

  // Drop every tracked pointer. A captured pointer whose zone unmounted, or that was under an
  // overlay / rotation, never delivers its pointerup, which would leave a ref stale and freeze
  // look or fire (the 2026-06-15 freeze). Called from effect cleanups below, so it only touches refs.
  const resetPointers = () => {
    resetMobileInput()
    lookPointerRef.current = null
    shootPointerRef.current = null
    movePointerRef.current = null
    grenPointerRef.current = null
    usePointerRef.current = null
    mailPointerRef.current = null
    setMailOpen(false)
    lookBtnRef.current = null
    lookDraggedRef.current = false
    holdFiredRef.current = false
    shootDraggedRef.current = false
    shootHoldFiredRef.current = false
    clearTimeout(holdTimerRef.current)
    clearTimeout(shootHoldTimerRef.current)
    holdTimerRef.current = null
    shootHoldTimerRef.current = null
    setStick((st) => (st.on ? { on: false, cx: 0, cy: 0, x: 0, y: 0 } : st))
  }
  const resetPointersRef = useRef(resetPointers)
  resetPointersRef.current = resetPointers

  // Cleanup runs whenever one of these changes: the zones unmount (wave_clear, shop) or an
  // overlay opens over them (pause, settings, shop). The cleanup runs on every change, so both
  // opening and closing start from clean pointer state.
  useEffect(() => () => resetPointersRef.current(), [active, shopOpen, paused, pauseMenu])

  // Rotation and viewport changes (address bar, split view) cancel touches without events.
  useEffect(() => {
    const drop = () => resetPointersRef.current()
    window.addEventListener('orientationchange', drop)
    window.addEventListener('resize', drop)
    return () => {
      window.removeEventListener('orientationchange', drop)
      window.removeEventListener('resize', drop)
    }
  }, [])

  useEffect(() => {
    mobileState.active = isMobile && active && !shopOpen
  }, [isMobile, active, shopOpen])

  useEffect(() => () => {
    mobileState.active = false
    resetMobileInput()
    clearTimeout(holdTimerRef.current)
    clearTimeout(shootHoldTimerRef.current)
  }, [])

  const touchGuards = useMemo(() => ({
    onContextMenu: (e) => e.preventDefault(),
    onPointerCancel: () => {
      resetPointersRef.current()
    },
  }), [])

  if (!isMobile) return null

  if (!active) return null
  if (shopOpen) return <div style={{ ...styles.root, opacity: 0, pointerEvents: 'none' }} />

  // ── Joystick handlers ──────────────────────────────────────────────────────

  const onMoveStart = (e) => {
    e.preventDefault()
    if (movePointerRef.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    movePointerRef.current = e.pointerId
    stickCenterRef.current = { x: e.clientX, y: e.clientY }
    const r = rootRef.current?.getBoundingClientRect()
    setStick({ on: true, cx: e.clientX - (r?.left ?? 0), cy: e.clientY - (r?.top ?? 0), x: 0, y: 0 })
  }

  const onMove = (e) => {
    if (movePointerRef.current !== e.pointerId) return
    e.preventDefault()
    const center = stickCenterRef.current
    const v = stickVector(e.clientX - center.x, e.clientY - center.y)
    mobileInput.moveX = v.x
    mobileInput.moveY = -v.y
    setStick((st) => ({ ...st, x: v.knobX, y: v.knobY }))
  }

  const onMoveEnd = (e) => {
    if (movePointerRef.current !== e.pointerId) return
    e.preventDefault()
    movePointerRef.current = null
    mobileInput.moveX = 0
    mobileInput.moveY = 0
    setStick({ on: false, cx: 0, cy: 0, x: 0, y: 0 })
  }

  // ── Hit-test helper ────────────────────────────────────────────────────────

  // Circle hit test with an invisible HIT_PAD ring; the closest edge wins where rings overlap.
  function hitButton(x, y) {
    let best = null
    let bestGap = Infinity
    for (const [ref, id] of [
      [shootBtnRef, 'shoot'],
      [interactBtnRef, 'interact'],
      [reloadBtnRef, 'reload'],
      [swapBtnRef, 'swap'],
      [grenBtnRef, 'grenade'],
      [cycleBtnRef, 'cycle'],
      [mailBtnRef, 'mail'],
    ]) {
      const el = ref.current
      if (!el) continue
      const r = el.getBoundingClientRect()
      const rad = r.width / 2
      const gap = Math.hypot(x - (r.left + rad), y - (r.top + r.height / 2)) - rad
      if (gap <= HIT_PAD && gap < bestGap) { best = id; bestGap = gap }
    }
    return best
  }

  // ── Look-zone handlers (cover the whole right half + button area) ──────────
  //
  // Design contract:
  //   • ANY drag → camera movement (regardless of where the touch started)
  //   • Touch starts on a button AND moves < DRAG_THRESHOLD → button tap
  //   • Touch starts on a held button AND stays stationary 60 ms → held-fire,
  //     but if it later drags the hold is cancelled and camera takes over
  //   • Touch starts in open space → pure camera look

  // Cancels only what the look finger itself started (held-fire on the FIRE area). The USE finger and
  // the secondary shoot finger own their own flags and must survive the look finger dragging.
  const cancelHold = () => {
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    if (holdFiredRef.current && lookBtnRef.current === 'shoot' && shootPointerRef.current === null) mobileInput.shootHeld = false
    if (holdFiredRef.current && lookBtnRef.current === 'interact' && usePointerRef.current === null) mobileInput.interactHeld = false
  }

  const cancelShootHold = () => {
    clearTimeout(shootHoldTimerRef.current)
    shootHoldTimerRef.current = null
    mobileInput.shootHeld = false
  }

  const onLookStart = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    // Grenade button: dedicated finger, held = cooking
    if (grenPointerRef.current === null && hitButton(e.clientX, e.clientY) === 'grenade') {
      grenPointerRef.current = e.pointerId
      mobileInput.grenadeHeld = true
      return
    }

    // MAIL button: dedicated finger too (toggles the list on release)
    if (mailPointerRef.current === null && hitButton(e.clientX, e.clientY) === 'mail') {
      mailPointerRef.current = e.pointerId
      return
    }

    // USE button: dedicated finger. Held = hold-to-use (boards, doors, box, bench, revive)
    if (usePointerRef.current === null && hitButton(e.clientX, e.clientY) === 'interact') {
      usePointerRef.current = e.pointerId
      mobileInput.interactHeld = true
      mobileInput.interactPressed = true
      return
    }

    // Safety: if both slots are stuck from lost pointer events, reset and reclaim primary
    if (lookPointerRef.current !== null && shootPointerRef.current !== null) {
      clearTimeout(holdTimerRef.current)
      clearTimeout(shootHoldTimerRef.current)
      holdTimerRef.current = null
      shootHoldTimerRef.current = null
      lookPointerRef.current = null
      shootPointerRef.current = null
      mobileInput.shootHeld = false
      mobileInput.interactHeld = false
    }

    if (lookPointerRef.current === null) {
      // PRIMARY TOUCH — camera look
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
    if (e.pointerId === grenPointerRef.current || e.pointerId === usePointerRef.current || e.pointerId === mailPointerRef.current) return
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
    if (e.pointerId === mailPointerRef.current) {
      e.preventDefault()
      mailPointerRef.current = null
      setMailOpen((o) => !o)
      return
    }
    if (e.pointerId === usePointerRef.current) {
      e.preventDefault()
      usePointerRef.current = null
      mobileInput.interactHeld = false
      return
    }
    if (e.pointerId === grenPointerRef.current) {
      e.preventDefault()
      grenPointerRef.current = null
      mobileInput.grenadeHeld = false
      return
    }
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

    // Release only what this finger held (USE and the secondary shoot finger keep their own holds)
    if (shootPointerRef.current === null) mobileInput.shootHeld = false
    if (usePointerRef.current === null) mobileInput.interactHeld = false

    // Tap: finger up without dragging, and hold timer didn't already activate.
    // A tap on open space (hit === null) or the shoot button fires — any part of
    // the look zone counts as a shoot tap unless it's a utility button.
    if (!dragged && !holdFired) {
      if (hit === 'shoot' || hit === null) mobileInput.shootPressed = true
      else if (hit === 'interact') mobileInput.interactPressed = true
      else if (hit === 'reload') mobileInput.reloadPressed = true
      else if (hit === 'swap') mobileInput.swapPressed = true
      else if (hit === 'cycle') mobileInput.cyclePressed = true
    }

    lookBtnRef.current = null
    lookDraggedRef.current = false
    holdFiredRef.current = false
  }

  const onLookCancel = (e) => {
    if (e.pointerId === mailPointerRef.current) {
      mailPointerRef.current = null
      return
    }
    if (e.pointerId === usePointerRef.current) {
      usePointerRef.current = null
      mobileInput.interactHeld = false
      return
    }
    if (e.pointerId === grenPointerRef.current) {
      grenPointerRef.current = null
      mobileInput.grenadeHeld = false
      return
    }
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

  const swapIcon = activeItem === 'gun' ? 'KNIFE' : 'GUN'

  const k = buttonSize === 'large' ? 1.2 : 1
  const op = buttonOpacity
  const alpha = (base) => Math.min(1, +(base * op / DEFAULT_BUTTON_OPACITY).toFixed(3))
  const side = leftHanded ? 'left' : 'right'
  const sgn = leftHanded ? -1 : 1
  const insetSide = leftHanded ? INSET_L : INSET_R
  const zoneW = stickZoneWidth(leftHanded)
  const glassBg = `rgba(10, 12, 16, ${alpha(0.55)})`
  // One button of the cluster, centred on (dx, dy) from the FIRE centre (dx right, dy up);
  // The cluster anchor is a zero-size box at the FIRE centre, so `side`/`bottom` offsets of a child are
  // measured from that centre. Left-handed mirrors dx by switching `side`.
  const inward = ([dx, dy], r) => ({
    position: 'absolute',
    [side]: (-dx) * k - r * k,
    bottom: dy * k - r * k,
    width: 2 * r * k,
    height: 2 * r * k,
  })

  return (
    <div ref={rootRef} style={styles.root} {...touchGuards}>
      {/* Floating stick zone: the stick spawns where the thumb lands. Left ~40% of the screen
          (right in left-handed mode), below the top strip that holds the pause button and HUD. */}
      <div
        data-stick-zone
        style={{ ...styles.moveZone, top: STICK_TOP, width: zoneW, [leftHanded ? 'right' : 'left']: 0 }}
        onPointerDown={onMoveStart}
        onPointerMove={onMove}
        onPointerUp={onMoveEnd}
        onPointerCancel={onMoveEnd}
      />

      {/* Resting hint: faint ring at the default thumb spot */}
      {!stick.on && (
        <div
          data-stick-hint
          style={{
            ...styles.stickHint,
            [side === 'right' ? 'left' : 'right']: `calc(max(14px, ${leftHanded ? INSET_R : INSET_L}) + 13px)`,
            bottom: `calc(max(14px, ${INSET_B}) + 13px)`,
            opacity: Math.min(1, op / DEFAULT_BUTTON_OPACITY) * 0.5,
          }}
        />
      )}

      {/* Live stick */}
      {stick.on && (
        <div
          data-stick-ring
          style={{ ...styles.stickRing, left: stick.cx - STICK_RADIUS, top: stick.cy - STICK_RADIUS, width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, background: glassBg }}
        >
          <div style={{ ...styles.stickKnob, transform: `translate(${stick.x * STICK_RADIUS}px, ${stick.y * STICK_RADIUS}px)`, background: `rgba(220, 230, 240, ${alpha(0.46)})` }} />
        </div>
      )}

      {/* Look zone: everything beside the stick zone, button area included. Its inner edge is the
          stick zone's edge (same expression), so the two never overlap, with or without a notch. */}
      <div
        data-look-zone
        style={{ ...styles.lookZone, [leftHanded ? 'left' : 'right']: 0, [leftHanded ? 'right' : 'left']: zoneW }}
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookCancel}
      />

      {/* Visual-only button cluster: pointer-events none, the look zone does the input. Refs are
          used for hit testing (drawn circle + HIT_PAD ring). */}
      <div
        data-cluster
        style={{
          position: 'absolute', width: 0, height: 0, pointerEvents: 'none',
          [side]: `calc(${insetSide} + ${ANCHOR_RIGHT * k}px)`,
          bottom: `calc(${INSET_B} + ${ANCHOR_BOTTOM * k}px)`,
        }}
      >
        <div
          ref={shootBtnRef} data-btn="fire"
          style={{ ...styles.roundBtn, ...styles.shootBtn, ...inward([0, 0], FIRE_R), background: `rgba(120,20,8,${alpha(0.68)})` }}
        >●</div>
        <div
          ref={interactBtnRef} data-btn="use"
          style={{
            ...styles.roundBtn, ...styles.interactBtn, ...inward(CLUSTER_OFFS.use, USE_R), background: glassBg,
            ...(showInteractHint ? { ...styles.interactActive, background: `rgba(70,46,0,${alpha(0.68)})` } : {}),
          }}
        >USE</div>
        <div ref={reloadBtnRef} data-btn="reload" style={{ ...styles.roundBtn, ...styles.reloadBtn, ...inward(CLUSTER_OFFS.reload, SMALL_R), background: `rgba(8,12,22,${alpha(0.55)})` }}>↻</div>
        <div ref={swapBtnRef} data-btn="knife" style={{ ...styles.roundBtn, ...styles.swapBtn, ...inward(CLUSTER_OFFS.swap, SMALL_R), background: glassBg }}>{swapIcon}</div>
        <div
          ref={grenBtnRef} data-btn="grenade"
          style={{ ...styles.roundBtn, ...styles.grenBtn, ...inward(CLUSTER_OFFS.gren, SMALL_R), background: `rgba(30,40,12,${alpha(0.62)})`, ...(grenades <= 0 ? { opacity: 0.4 } : {}) }}
        >
          GREN<span style={styles.grenCount}>{grenades}</span>
        </div>
        {mailOn && (
          <div
            ref={mailBtnRef} data-btn="mail"
            style={{ ...styles.roundBtn, ...styles.swapBtn, ...inward(CLUSTER_OFFS.mail, SMALL_R), background: `rgba(40,30,6,${alpha(0.62)})`, border: '1px solid rgba(255,200,80,0.6)', color: mailOpen ? '#ffe9a8' : '#f4efe4' }}
          >
            MAIL<span style={{ ...styles.grenCount, color: '#ffe066' }}>{Math.floor(mailMeter)}</span>
          </div>
        )}
        {mailOn && mailOpen && (
          <div data-mail-list style={{ ...styles.mailList, [side]: 182 * k, bottom: -ANCHOR_BOTTOM * k + 8, width: 150 * k }}>
            {MAIL_ITEMS.map((it) => (
              <div
                key={it.id} data-mail-item={it.id}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (sendMail(it.id)) setMailOpen(false) }}
                style={{ ...styles.mailItem, height: 48, ...(mailMeter >= it.cost ? styles.mailItemOn : null) }}
              >
                <span>{it.label.toUpperCase()}</span><span>{it.cost}</span>
              </div>
            ))}
          </div>
        )}
        {ownedCount > 1 && <div ref={cycleBtnRef} data-btn="cycle" style={{ ...styles.roundBtn, ...styles.swapBtn, ...inward(CLUSTER_OFFS.cycle, SMALL_R), background: glassBg }}>⇄</div>}
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
  // Floating stick zone (left ~40% below the top strip; mirrored when left-handed)
  moveZone: {
    position: 'absolute',
    bottom: 0,
    pointerEvents: 'auto',
    touchAction: 'none',
  },
  stickHint: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 999,
    border: '1px solid rgba(255, 255, 255, 0.28)',
    pointerEvents: 'none',
  },
  stickRing: {
    position: 'absolute',
    ...glass,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  stickKnob: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: 'rgba(220, 230, 240, 0.46)',
    border: '1px solid rgba(255,255,255,0.45)',
  },
  // Look zone: the rest of the screen. Inner edge is set in render from the stick zone width.
  lookZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  // Base round button (visual only; geometry comes from the cluster layout)
  roundBtn: {
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    ...glass,
    color: '#f4efe4',
    fontWeight: 'bold',
    fontSize: 11,
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    userSelect: 'none',
  },
  shootBtn: {
    fontSize: 24,
    border: '2px solid rgba(255,100,60,0.6)',
    boxShadow: '0 0 18px rgba(180,40,20,0.45)',
    color: '#ffd6c0',
  },
  interactBtn: {
    fontSize: 12, fontWeight: 'bold', letterSpacing: 1,
  },
  interactActive: {
    border: '1px solid rgba(255,200,50,0.7)',
    boxShadow: '0 0 14px rgba(210,160,0,0.4)',
  },
  reloadBtn: {
    fontSize: 18,
    color: 'rgba(200,220,240,0.9)',
  },
  grenBtn: {
    fontSize: 11, fontWeight: 'bold', letterSpacing: 0,
    border: '1px solid rgba(150,190,70,0.55)',
  },
  grenCount: {
    position: 'absolute',
    right: -2,
    bottom: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    background: 'rgba(0,0,0,0.8)',
    color: '#cfe88a',
    fontSize: 11,
    lineHeight: '16px',
    textAlign: 'center',
  },
  swapBtn: {
    fontSize: 11, fontWeight: 'bold', letterSpacing: 0,
  },
  mailList: {
    position: 'absolute', display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'auto', touchAction: 'none',
  },
  mailItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', boxSizing: 'border-box',
    borderRadius: 10, background: 'rgba(10,12,16,0.78)', border: '1px solid rgba(255,255,255,0.22)',
    color: '#777', fontSize: 12, fontWeight: 'bold', letterSpacing: 1,
  },
  mailItemOn: { color: '#ffe9a8', border: '1px solid rgba(255,200,80,0.75)', background: 'rgba(60,44,8,0.85)' },
}
