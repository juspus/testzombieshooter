// Interaction: chest, windows, reviving, Mystery Box / Upgrade Bench, doors, boarding, hold T to skip.
// Moved verbatim out of components/Player.jsx.
import { useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { playDoorDenied } from '../sounds'
import { mobileInput } from '../mobileInput'
import { lifecycleInput } from '../pause'
import { doorBuyStatus } from '../doors'
import { updateMachines } from '../machineInput'
import { getRemotePlayerPos } from '../components/RemotePlayer'
import { otherRole, inReviveRange, stepRevive } from '../coopDown'
import { reportRevive } from '../coopRuntime'
import {
  DOOR_DEFS,
  DOOR_REACH_SQ,
  DOOR_HOLD,
  netSend,
  CHEST_RADIUS_SQ,
  SKIP_TIME,
  boardTimeForPerks,
  WINDOW_DEFS,
  CHEST_POS,
} from './constants'

export default function usePlayerInteraction(P) {
  const { camera, phase, windowPlanksRef, shopOpenRef, reviveNearRef, nearChestRef, perksRef, keys } = P

  const addPlank = useGameStore((s) => s.addPlank)
  const upgradePlanks = useGameStore((s) => s.upgradePlanks)
  const skipIntermission = useGameStore((s) => s.skipIntermission)
  const setNearWindowId = useGameStore((s) => s.setNearWindowId)
  const setBoardingProgress = useGameStore((s) => s.setBoardingProgress)
  const setSkipProgress = useGameStore((s) => s.setSkipProgress)

  const setNearChest = useGameStore((s) => s.setNearChest)

  const windowPlankStrong = useGameStore((s) => s.windowPlankStrong)
  const strongPlanksMode = useGameStore((s) => s.strongPlanksMode)

  const windowPlankStrongRef = useRef(windowPlankStrong)
  const strongPlanksModeRef = useRef(strongPlanksMode)
  const prevNearWindowRef = useRef(-1)
  const boardTimerRef = useRef(0)
  const boardingWindowRef = useRef(-1)
  const doorHoldRef = useRef(0)       // Wave 3 doors: hold timer / id / deny latch / request cooldown
  const doorHoldIdRef = useRef(null)
  const doorDeniedRef = useRef(false)
  const doorCooldownRef = useRef(0)
  const skipTimerRef = useRef(0)

  const reviveProgRef = useRef(0)
  const reviveSentRef = useRef(0)

  useEffect(() => { windowPlankStrongRef.current = windowPlankStrong }, [windowPlankStrong])
  useEffect(() => { strongPlanksModeRef.current = strongPlanksMode }, [strongPlanksMode])

  function step(delta, gsC, inCoop, downed) {
    // Chest proximity
    {
      const px = camera.position.x, pz = camera.position.z
      const cdx = px - CHEST_POS.x, cdz = pz - CHEST_POS.z
      const near = cdx * cdx + cdz * cdz < CHEST_RADIUS_SQ
      if (near !== nearChestRef.current) {
        nearChestRef.current = near
        setNearChest(near)
      }
    }

    // Update nearest window for HUD prompt (only set store when value changes)
    {
      const px = camera.position.x, pz = camera.position.z
      let nearId = -1, nearDist = 2.5
      for (const win of WINDOW_DEFS) {
        const dx = px - win.ix, dz = pz - win.iz
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d < nearDist) { nearDist = d; nearId = win.id }
      }
      if (nearId !== prevNearWindowRef.current) {
        prevNearWindowRef.current = nearId
        setNearWindowId(nearId)
      }
    }

    // W5: hold E / interact within 1.5 m of a downed partner to revive them (3 s). Releasing, moving
    // out of range or going down yourself resets the hold. Takes priority over every other E use.
    {
      const eRaw = !!(keys.current['KeyE'] || mobileInput.interactHeld)
      let near = false
      if (inCoop && !downed && gsC.coop[otherRole(gsC.mpRole)].status === 'down') {
        const rp = getRemotePlayerPos()
        near = !!rp && inReviveRange(camera.position.x, camera.position.z, rp.x, rp.z)
      }
      if (near !== reviveNearRef.current) {
        reviveNearRef.current = near
        gsC.setCoopNear(near)
      }
      const prog = stepRevive(reviveProgRef.current, near && eRaw && !shopOpenRef.current, near, delta)
      if (prog !== reviveProgRef.current) {
        reviveProgRef.current = prog
        gsC.setCoopReviveProgress(Math.round(prog * 100) / 100)
        const q = prog >= 1 ? 1 : Math.floor(prog * 20) / 20   // net: ~7 msgs/s while holding
        if (q !== reviveSentRef.current) { reviveSentRef.current = q; reportRevive(q) }
        if (prog >= 1) { reviveProgRef.current = 0; reviveSentRef.current = 0 }
      }
    }
    const interactFree = !downed && !reviveNearRef.current

    // Wave 3 Mystery Box / Upgrade Bench: hold-E interaction + bench timer.
    {
      const eHeldM = interactFree && (keys.current['KeyE'] || mobileInput.interactHeld)
      useGameStore.getState().tickBench(delta)
      updateMachines(delta, camera.position.x, camera.position.z, eHeldM, shopOpenRef.current || nearChestRef.current)
    }

    // Wave 3 buyable doors: nearest closed door -> HUD prompt, hold E / interact to buy.
    if (DOOR_DEFS.length) {
      const gs = useGameStore.getState()
      const px = camera.position.x, pz = camera.position.z
      let doorId = null, bestD = DOOR_REACH_SQ
      for (const d of DOOR_DEFS) {
        if (d.link || gs.openDoors[d.id]) continue
        const dx = px - d.x, dz = pz - d.z
        const dd = dx * dx + dz * dz
        if (dd < bestD) { bestD = dd; doorId = d.id }
      }
      if (!interactFree) doorId = null   // W5: reviving / downed - no door prompt
      gs.setNearDoorId(doorId)
      if (doorCooldownRef.current > 0) doorCooldownRef.current -= delta
      const eHeld = interactFree && (keys.current['KeyE'] || mobileInput.interactHeld)
      const def = doorId ? DOOR_DEFS.find((d) => d.id === doorId) : null
      const status = def ? doorBuyStatus(def, DOOR_DEFS, gs.openDoors, gs.money) : 'open'
      if (def && eHeld && !shopOpenRef.current && !nearChestRef.current && doorCooldownRef.current <= 0 && (status === 'ok' || status === 'broke')) {
        if (status === 'broke') {
          if (!doorDeniedRef.current) { doorDeniedRef.current = true; playDoorDenied() }
        } else {
          if (doorHoldIdRef.current !== doorId) { doorHoldIdRef.current = doorId; doorHoldRef.current = 0 }
          doorHoldRef.current += delta
          gs.setDoorProgress(Math.min(doorHoldRef.current / DOOR_HOLD, 1))
          if (doorHoldRef.current >= DOOR_HOLD) {
            doorHoldRef.current = 0
            gs.setDoorProgress(0)
            if (gs.mpRole === 'guest' && gs.mpConnected) {
              // Guest: ask the host (authoritative); we pay when the host's door_open ack arrives.
              netSend('door_request', { id: doorId })
              doorCooldownRef.current = 1
            } else if (gs.buyDoor(doorId)) {
              netSend('door_open', { id: doorId, by: 'host' })
            }
          }
        }
      } else {
        if (!eHeld) doorDeniedRef.current = false
        if (doorHoldRef.current > 0 || doorHoldIdRef.current !== null) {
          doorHoldRef.current = 0
          doorHoldIdRef.current = null
          gs.setDoorProgress(0)
        }
      }
    }

    // Hold E to board or upgrade window planks (Carpenter speeds this up)
    {
      const BOARD_TIME = boardTimeForPerks(perksRef.current)
      const nearId = prevNearWindowRef.current
      const eHeld = interactFree && (keys.current['KeyE'] || mobileInput.interactHeld)
      const plankCount = windowPlanksRef.current[nearId] ?? 0
      const isStrong = windowPlankStrongRef.current[nearId] ?? false
      const strongMode = strongPlanksModeRef.current
      const canAddPlank = plankCount < 2 && !(isStrong && !strongMode) && !(strongMode && !isStrong && plankCount > 0)
      const canUpgrade = strongMode && plankCount > 0 && !isStrong
      const canBoard = eHeld && nearId >= 0 && (canAddPlank || canUpgrade) && !nearChestRef.current && !useGameStore.getState().nearMachine

      if (canBoard) {
        if (boardingWindowRef.current !== nearId) {
          boardingWindowRef.current = nearId
          boardTimerRef.current = 0
        }
        boardTimerRef.current += delta
        const progress = Math.min(boardTimerRef.current / BOARD_TIME, 1)
        setBoardingProgress(progress)
        if (boardTimerRef.current >= BOARD_TIME) {
          if (canUpgrade) {
            upgradePlanks(nearId)
          } else if (canAddPlank) {
            addPlank(nearId)
            netSend('add_plank', { windowId: nearId })
          }
          boardTimerRef.current = 0
          setBoardingProgress(0)
        }
      } else {
        if (boardTimerRef.current > 0 || boardingWindowRef.current !== -1) {
          boardTimerRef.current = 0
          boardingWindowRef.current = -1
          setBoardingProgress(0)
        }
      }
    }

    // Hold T to skip intermission (2-second hold)
    if (phase === 'intermission') {
      if (keys.current['KeyT'] || lifecycleInput.skipHeld) {
        skipTimerRef.current += delta
        setSkipProgress(Math.min(skipTimerRef.current / SKIP_TIME, 1))
        if (skipTimerRef.current >= SKIP_TIME) {
          skipTimerRef.current = 0
          setSkipProgress(0)
          skipIntermission()
          netSend('skip_intermission', {})
        }
      } else if (skipTimerRef.current > 0) {
        skipTimerRef.current = 0
        setSkipProgress(0)
      }
    }
  }

  return { step }
}
