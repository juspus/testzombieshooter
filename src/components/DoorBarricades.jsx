import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import { getMap, getInitialMapId } from '../maps'
import { texBoxProps } from '../textures'

// Wave 3 buyable doors: a boarded barricade filling each interior doorway until bought.
// Always mounted (one group per door, a handful of meshes sharing cached geometry +
// materials); opening plays a short "boards fall" animation by mutating refs in
// useFrame (no React state per frame), then hides the group.

const DOOR_DEFS = getMap(getInitialMapId()).DOOR_DEFS ?? []

const BOARD_COLOR = '#5a3c10'          // same board colour as the window planks (shared material)
const BOARD_YS = [0.32, 0.78, 1.24, 1.7, 2.12]
const BOARD_TILT = [0.05, -0.07, 0.04, -0.05, 0.06]   // static crooked-nailed-on look
const BOARD_H = 0.2
const BOARD_T = 0.16
const OPEN_SECONDS = 0.7

function DoorBarricade({ def }) {
  const isOpen = useGameStore((s) => !!s.openDoors?.[def.id])
  const groupRef = useRef()
  const boardRefs = useRef([])
  const targetRef = useRef(isOpen ? 1 : 0)
  const tRef = useRef(isOpen ? 1 : 0)
  targetRef.current = isOpen ? 1 : 0
  // New run -> barricade is back instantly (no reverse animation)
  const resetRef = useRef(false)
  if (!isOpen && tRef.current > 0) { tRef.current = 0; resetRef.current = true }

  const alongZ = def.axis === 'z'                 // doorway runs along Z (wall at constant X)
  const length = (alongZ ? def.halfD : def.halfW) * 2 - 0.1
  const boardArgs = alongZ ? [BOARD_T, BOARD_H, length] : [length, BOARD_H, BOARD_T]
  const postArgs = alongZ ? [BOARD_T + 0.06, 2.3, 0.16] : [0.16, 2.3, BOARD_T + 0.06]
  const postOff = length / 2

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    const t0 = tRef.current
    if (t0 >= 1 && targetRef.current >= 1) { if (g.visible) g.visible = false; return }
    if (t0 <= 0 && targetRef.current <= 0) {
      if (!g.visible) g.visible = true
      if (resetRef.current) {   // boards go back to their nailed-on pose
        resetRef.current = false
        boardRefs.current.forEach((b, i) => {
          if (!b) return
          b.position.set(0, BOARD_YS[i], 0)
          if (alongZ) b.rotation.set(0, 0, BOARD_TILT[i]); else b.rotation.set(BOARD_TILT[i], 0, 0)
        })
      }
      return
    }
    if (targetRef.current > t0) tRef.current = Math.min(1, t0 + delta / OPEN_SECONDS)
    const t = tRef.current
    g.visible = t < 1
    for (let i = 0; i < boardRefs.current.length; i++) {
      const b = boardRefs.current[i]
      if (!b) continue
      // Each board lets go a little after the previous one, then drops and tips over.
      const p = Math.max(0, Math.min(1, (t - i * 0.09) / 0.55))
      const fall = p * p
      const sgn = i % 2 ? 1 : -1
      b.position.y = BOARD_YS[i] - fall * (BOARD_YS[i] - 0.08)
      if (alongZ) { b.position.x = fall * 0.5 * sgn; b.rotation.set(0, 0, BOARD_TILT[i] * (1 - p) + fall * 1.3 * sgn) }
      else        { b.position.z = fall * 0.5 * sgn; b.rotation.set(BOARD_TILT[i] * (1 - p) + fall * 1.3 * sgn, 0, 0) }
    }
  })

  return (
    <group ref={groupRef} position={[def.x, 0, def.z]} visible={!isOpen}>
      {BOARD_YS.map((y, i) => (
        <mesh
          key={i}
          ref={(m) => { boardRefs.current[i] = m }}
          position={[0, y, 0]}
          rotation={alongZ ? [0, 0, BOARD_TILT[i]] : [BOARD_TILT[i], 0, 0]}
          {...texBoxProps(boardArgs, 'wood', BOARD_COLOR, 0.95)}
        />
      ))}
      {/* Two uprights the boards are nailed to */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={alongZ ? [0, 1.15, s * postOff] : [s * postOff, 1.15, 0]}
          {...texBoxProps(postArgs, 'wood', '#2a1a06', 0.95)}
        />
      ))}
    </group>
  )
}

export default function DoorBarricades() {
  return (
    <>
      {DOOR_DEFS.map((def) => <DoorBarricade key={def.id} def={def} />)}
    </>
  )
}
