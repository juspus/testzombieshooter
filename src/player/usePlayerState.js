// Player state shared by more than one part of the player: store values, the refs the input, firing,
// interaction and movement hooks all read, and the effects that mirror the store into them. (State only one
// hook needs lives in that hook.) Moved verbatim out of components/Player.jsx.
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useGameStore } from '../store'

export default function usePlayerState() {
  const { camera, gl } = useThree()

  const phase = useGameStore((s) => s.phase)

  const activeItem = useGameStore((s) => s.activeItem)
  const perks = useGameStore((s) => s.perks)

  const shopOpen = useGameStore((s) => s.shopOpen)
  const windowPlanks = useGameStore((s) => s.windowPlanks)

  const windowPlanksRef = useRef(windowPlanks)

  const paused = useGameStore((s) => s.paused)
  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const shopOpenRef = useRef(false)

  // W5 co-op down/revive
  const selfStatusRef = useRef('alive')   // 'alive' | 'down' | 'dead' (this client)
  const reviveNearRef = useRef(false)     // standing next to a downed partner (E = revive, not shop/board)

  const nearChestRef = useRef(false)

  const weapon = useGameStore((s) => s.weapon)

  const weaponRef = useRef(weapon)

  const activeItemRef = useRef(activeItem)
  const perksRef = useRef(perks)

  const yaw = useRef(0)
  const pitch = useRef(0)
  const keys = useRef({})
  const locked = useRef(false)
  const reloadTimer = useRef(0)

  useEffect(() => { windowPlanksRef.current = windowPlanks }, [windowPlanks])

  useEffect(() => { weaponRef.current = weapon }, [weapon])

  useEffect(() => { activeItemRef.current = activeItem }, [activeItem])
  useEffect(() => { perksRef.current = perks }, [perks])

  // Cancel any in-progress reload when the player switches weapons
  useEffect(() => { reloadTimer.current = 0 }, [weapon])

  return {
    camera,
    gl,
    phase,
    activeItem,
    perks,
    shopOpen,
    windowPlanks,
    windowPlanksRef,
    paused,
    pausedRef,
    shopOpenRef,
    selfStatusRef,
    reviveNearRef,
    nearChestRef,
    weapon,
    weaponRef,
    activeItemRef,
    perksRef,
    yaw,
    pitch,
    keys,
    locked,
    reloadTimer,
  }
}
