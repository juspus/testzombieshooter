// Joining a run already in progress, and opening a solo run to the public list.
//
// Host (a solo normal run, from the pause menu): openPublicRoom() opens a PeerJS room and lists
// it (openRuns.js), refreshed every 20 s with the current wave. A guest who connects (list, code
// or invite link) sends its usual `map_hello`; the host answers at the next wave countdown (`join_wait` until then) with
// `join_welcome`: the house as it stands (wave, doors, planks, glass, box, modifier, countdown).
// Only then do both sides set mpConnected, so until the welcome the host's run stays solo
// (no downed state waiting on a partner who is not there) and nothing else is sent.
// Joining mid-fight is deliberately not supported: the countdown has no zombies to hand over.
//
// Guest: on the welcome it starts a fresh run of its own (pistol or its loadout, money scaled to the wave: joinMoney)
// placed in the host's countdown, then the normal co-op flow (NetManager) takes over.
// This file is the part every client needs (UI state, the guest's welcome); the host's room and
// listing live in publicRoom.js, loaded when the host opens a room.
import { create } from 'zustand'
import { useGameStore } from './store'
import { disconnect } from './net'
import { buildGrid } from './walls'
import { allWallSegments, playerCollisionWalls, bulletsForWave, zombiesForWave } from './store/shared'
import { CLIP_SIZE } from './store/weapons'

// state: 'closed' | 'opening' | 'open' (listed, nobody linked) | 'waiting' (a player joins at
// the next countdown) | 'joined'. Guest side: join: null | 'waiting' (joins at wave joinWave) | 'refused'.
export const usePublicRoom = create(() => ({ state: 'closed', code: null, listed: false, join: null, joinWave: 0, joinError: '' }))
const ui = (p) => usePublicRoom.setState(p)

/**
 * Money a player gets for joining at the start of wave `wave`: three quarters of what a solo
 * player would have earned by then (one per kill plus the €15 wave reward), on top of the €10
 * start. Enough to buy a gun at the countdown without matching a careful saver.
 */
export function joinMoney(wave) {
  let earned = 0
  for (let w = 1; w < wave; w++) earned += zombiesForWave(w) + 15
  return 10 + Math.round(earned * 0.75)
}

export const isActive = (ph) => ph === 'playing' || ph === 'intermission'

/** A solo normal run the player may open to the public. */
export function canOpenRoom(s) {
  return isActive(s.phase) && s.runMode === 'normal' && !s.mpRole && !s.director?.active && s.runSeed == null
}

/** Pure: the guest's store patch for a welcome (applied after its own startGame()). */
export function welcomePatch(d, current) {
  const total = bulletsForWave(d.wave)
  const pistol = current.weapon === 'pistol'
  const clip = Math.min(CLIP_SIZE, total)
  return {
    phase: 'intermission',
    wave: d.wave,
    waveModifier: d.modifier ?? null,
    intermissionLeft: d.intermissionLeft,
    openDoors: d.openDoors,
    walls: playerCollisionWalls(d.openDoors),
    windowPlanks: d.windowPlanks,
    windowPlankStrong: d.windowPlankStrong ?? {},
    brokenWindows: d.brokenWindows ?? {},
    nextId: d.nextId ?? current.nextId,
    money: joinMoney(d.wave),
    ...(pistol ? { bulletsInClip: clip, reserveBullets: total - clip } : null),
  }
}

// ── Guest ────────────────────────────────────────────────────────────────────
// The guest joins the normal way (room code, invite link or the Open runs list): once linked it
// repeats `map_hello` (NetManager), which a mid-run host answers. NetManager hands the three
// answers here.
export const REFUSE_TEXT = { map: 'That run is on another map', ended: 'That run has ended' }

/** Guest: a host's answer to its hello while a run is in progress. */
export function onJoinAnswer(event, data) {
  if (event === 'join_wait') ui({ join: 'waiting', joinWave: data.wave, joinError: '' })
  else if (event === 'join_refuse') {
    ui({ join: 'refused', joinWave: 0, joinError: REFUSE_TEXT[data.reason] ?? 'Could not join' })
    disconnect()
    useGameStore.getState().clearMp()
  } else if (event === 'join_welcome') applyWelcome(data)
}

function applyWelcome(d) {
  const store = useGameStore
  if (store.getState().phase !== 'start') return
  store.getState().startGame()
  const patch = welcomePatch(d, store.getState())
  buildGrid(allWallSegments(patch.windowPlanks, patch.openDoors))
  store.setState(patch)
  if (d.box) store.getState().setBox({ ...d.box, at: performance.now() })
  ui({ join: null, joinWave: 0, joinError: '' })
}

