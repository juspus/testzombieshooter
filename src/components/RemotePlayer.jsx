import { useGameStore } from '../store'

export default function RemotePlayer() {
  const multiplayerRole = useGameStore((s) => s.multiplayerRole)
  const remotePlayer = useGameStore((s) => s.remotePlayer)
  const hostView = useGameStore((s) => s.hostView)
  return (
    <>
      {multiplayerRole !== 'guest' && (
        <mesh position={[remotePlayer.x, 0.9, remotePlayer.z]}>
          <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
          <meshStandardMaterial color="#66ccff" emissive="#114455" />
        </mesh>
      )}
      {multiplayerRole === 'guest' && (
        <mesh position={[hostView.x, 0.9, hostView.z]}>
          <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
          <meshStandardMaterial color="#ffcc66" emissive="#553311" />
        </mesh>
      )}
    </>
  )
}
