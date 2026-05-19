import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'

export default function RemotePlayer() {
  const groupRef = useRef()
  const mpConnected = useGameStore((s) => s.mpConnected)

  useFrame(() => {
    if (!groupRef.current) return
    const rp = useGameStore.getState().remotePlayer
    if (!rp) {
      groupRef.current.visible = false
      return
    }
    groupRef.current.visible = true
    groupRef.current.position.set(rp.x, 0, rp.z)
    groupRef.current.rotation.y = rp.yaw
  })

  if (!mpConnected) return null

  return (
    <group ref={groupRef} visible={false}>
      {/* Body */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[0.55, 0.8, 0.3]} />
        <meshStandardMaterial color="#44aaff" transparent opacity={0.85} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.19, 8, 8]} />
        <meshStandardMaterial color="#66ccff" transparent opacity={0.85} />
      </mesh>
      {/* Gun barrel hint */}
      <mesh position={[0.22, 1.0, -0.28]}>
        <boxGeometry args={[0.06, 0.06, 0.35]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  )
}
