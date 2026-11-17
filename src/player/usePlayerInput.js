// Input: pointer lock, the shop's cursor release, keyboard, wheel weapon switch, and the mobile buttons.
// Moved verbatim out of components/Player.jsx.
import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store'
import { getSettings } from '../settings'
import { reloadTimeForPerks, playReloadFor, LOOK_SENSITIVITY } from './constants'

export default function usePlayerInput(P) {
  const {
    gl,
    phase,
    shopOpen,
    pausedRef,
    shopOpenRef,
    selfStatusRef,
    reviveNearRef,
    nearChestRef,
    weaponRef,
    activeItemRef,
    perksRef,
    yaw,
    pitch,
    keys,
    locked,
    reloadTimer,
  } = P

  const toggleItem = useGameStore((s) => s.toggleItem)

  const beginReload = useGameStore((s) => s.beginReload)

  const openShop = useGameStore((s) => s.openShop)
  const closeShop = useGameStore((s) => s.closeShop)

  const ownedWeapons = useGameStore((s) => s.ownedWeapons)
  const switchWeapon = useGameStore((s) => s.switchWeapon)

  const ownedWeaponsRef = useRef(ownedWeapons)

  useEffect(() => { ownedWeaponsRef.current = ownedWeapons }, [ownedWeapons])

  const requestLock = useCallback(() => {
    if ((phase === 'playing' || phase === 'intermission') && !shopOpenRef.current) {
      gl.domElement.requestPointerLock()?.catch?.(() => {})
    }
  }, [phase, gl, shopOpenRef])

  // Sync shopOpen ref and manage pointer lock: the shop frees the cursor, and
  // closing it re-locks if we had the lock going in (never true on touch).
  // Not on Escape: it's the browser's own unlock key, and on Windows Chrome
  // re-handles that same press after we re-lock, leaving the mouse half-locked.
  const relockAfterShopRef = useRef(false)
  useEffect(() => {
    shopOpenRef.current = shopOpen
    if (shopOpen) {
      // Only ever set here: this re-runs when requestLock changes (phase), by
      // which point the lock is already released.
      if (locked.current) relockAfterShopRef.current = true
      document.exitPointerLock?.()
    } else if (relockAfterShopRef.current) {
      relockAfterShopRef.current = false
      requestLock()
    }
  }, [shopOpen, requestLock, locked, shopOpenRef])

  useEffect(() => {
    const onLockChange = () => {
      locked.current = document.pointerLockElement === gl.domElement
    }
    const onMouseMove = (e) => {
      if (!locked.current || pausedRef.current) return
      yaw.current -= e.movementX * LOOK_SENSITIVITY * getSettings().lookSensitivity
      pitch.current -= e.movementY * LOOK_SENSITIVITY * getSettings().lookSensitivity
      pitch.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch.current))
    }
    const onKeyDown = (e) => {
      keys.current[e.code] = true
      if (e.code === 'Escape' && shopOpenRef.current) {
        relockAfterShopRef.current = false
        closeShop()
        return
      }
      if (e.code === 'KeyE') {
        if (shopOpenRef.current) { closeShop(); return }
        if (selfStatusRef.current !== 'alive' || reviveNearRef.current) return
        if (nearChestRef.current) { openShop(); return }
      }
      if (e.code === 'KeyQ' && !shopOpenRef.current) {
        toggleItem()
        return
      }
      if (e.code === 'KeyR' && !shopOpenRef.current && activeItemRef.current === 'gun' && beginReload()) {
        reloadTimer.current = reloadTimeForPerks(perksRef.current, weaponRef.current)
        playReloadFor(weaponRef.current)
      }
    }
    const onKeyUp = (e) => { keys.current[e.code] = false }

    const onWheel = (e) => {
      if (shopOpenRef.current || pausedRef.current) return
      if (!locked.current) return
      const weapons = ownedWeaponsRef.current
      if (weapons.length <= 1) return
      const idx = weapons.indexOf(weaponRef.current)
      const dir = e.deltaY > 0 ? 1 : -1
      const next = (idx + dir + weapons.length) % weapons.length
      switchWeapon(weapons[next])
    }

    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('wheel', onWheel)
    }
  }, [gl, switchWeapon, activeItemRef, beginReload, closeShop, keys, locked, nearChestRef, openShop, pausedRef, perksRef, pitch, reloadTimer, reviveNearRef, selfStatusRef, shopOpenRef, toggleItem, weaponRef, yaw])

  function mobileButtons(mobilePressed, downed) {
    if (mobilePressed.interact) {
      if (shopOpenRef.current) {
        closeShop()
        shopOpenRef.current = false
      } else if (!downed && !reviveNearRef.current && nearChestRef.current) {
        openShop()
        shopOpenRef.current = true
      }
    }

    if (mobilePressed.swap && !shopOpenRef.current) {
      toggleItem()
    }

    // Mobile has no scroll wheel: the ⇄ button cycles through the carried guns.
    if (mobilePressed.cycle && !shopOpenRef.current) {
      const weapons = ownedWeaponsRef.current
      if (weapons.length > 1) {
        switchWeapon(weapons[(weapons.indexOf(weaponRef.current) + 1) % weapons.length])
        if (activeItemRef.current === 'knife') toggleItem()
      }
    }

    if (mobilePressed.reload && !shopOpenRef.current && activeItemRef.current === 'gun' && beginReload()) {
      reloadTimer.current = reloadTimeForPerks(perksRef.current, weaponRef.current)
      playReloadFor(weaponRef.current)
    }
  }

  return { requestLock, mobileButtons }
}
