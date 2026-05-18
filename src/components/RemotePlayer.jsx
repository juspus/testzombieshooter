import { useGameStore } from '../store'

export default function RemotePlayer() {
  const remotePlayer = useGameStore((s) => s.remotePlayer)
  return (
    <mesh position={[remotePlayer.x, 0.9, remotePlayer.z]}>
      <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
      <meshStandardMaterial color="#66ccff" emissive="#114455" />
    </mesh>
  )
}
