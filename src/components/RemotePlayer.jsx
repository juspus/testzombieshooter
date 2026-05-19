import { useGameStore } from '../store'

function HumanAvatar({ x, z, yaw = 0, pitch = 0, colors }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* legs */}
      <mesh position={[-0.14, 0.45, 0]}>
        <boxGeometry args={[0.16, 0.9, 0.16]} />
        <meshStandardMaterial color={colors.pants} roughness={0.95} />
      </mesh>
      <mesh position={[0.14, 0.45, 0]}>
        <boxGeometry args={[0.16, 0.9, 0.16]} />
        <meshStandardMaterial color={colors.pants} roughness={0.95} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.52, 0.62, 0.26]} />
        <meshStandardMaterial color={colors.shirt} roughness={0.9} />
      </mesh>

      {/* arms */}
      <mesh position={[-0.34, 1.12, 0]}>
        <boxGeometry args={[0.14, 0.58, 0.14]} />
        <meshStandardMaterial color={colors.sleeve} roughness={0.9} />
      </mesh>
      <mesh position={[0.34, 1.12, 0]}>
        <boxGeometry args={[0.14, 0.58, 0.14]} />
        <meshStandardMaterial color={colors.sleeve} roughness={0.9} />
      </mesh>

      {/* head */}
      <mesh position={[0, 1.62, 0]}>
        <boxGeometry args={[0.26, 0.28, 0.24]} />
        <meshStandardMaterial color={colors.skin} roughness={0.8} />
      </mesh>

      {/* simple gun and aim orientation */}
      <group position={[0.18, 1.25, -0.08]} rotation={[pitch * 0.45, 0, 0]}>
        <mesh position={[0, 0, -0.24]}>
          <boxGeometry args={[0.08, 0.08, 0.45]} />
          <meshStandardMaterial color="#2f2f2f" roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[0, -0.07, -0.03]}>
          <boxGeometry args={[0.08, 0.12, 0.12]} />
          <meshStandardMaterial color="#242424" roughness={0.7} metalness={0.25} />
        </mesh>
      </group>
    </group>
  )
}

export default function RemotePlayer() {
  const multiplayerRole = useGameStore((s) => s.multiplayerRole)
  const remotePlayer = useGameStore((s) => s.remotePlayer)
  const hostView = useGameStore((s) => s.hostView)
  return (
    <>
      {multiplayerRole !== 'guest' && (
        <HumanAvatar
          x={remotePlayer.x}
          z={remotePlayer.z}
          yaw={remotePlayer.yaw}
          pitch={remotePlayer.pitch}
          colors={{ shirt: '#3c6ea8', sleeve: '#2e5788', pants: '#2d2d35', skin: '#e0b28c' }}
        />
      )}
      {multiplayerRole === 'guest' && (
        <HumanAvatar
          x={hostView.x}
          z={hostView.z}
          yaw={hostView.yaw}
          pitch={hostView.pitch}
          colors={{ shirt: '#5d7a3a', sleeve: '#4a622d', pants: '#2a3028', skin: '#d8a781' }}
        />
      )}
    </>
  )
}
