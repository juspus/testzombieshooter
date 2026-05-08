import { useRef } from 'react'

const ARENA_SIZE = 40
const WALL_HEIGHT = 4
const WALL_THICKNESS = 1

export default function Arena() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_SIZE, ARENA_SIZE]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>

      {/* Floor grid lines */}
      <gridHelper args={[ARENA_SIZE, 20, '#333333', '#222222']} />

      {/* Walls */}
      <Wall position={[0, WALL_HEIGHT / 2, -ARENA_SIZE / 2]} args={[ARENA_SIZE, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[0, WALL_HEIGHT / 2, ARENA_SIZE / 2]} args={[ARENA_SIZE, WALL_HEIGHT, WALL_THICKNESS]} />
      <Wall position={[-ARENA_SIZE / 2, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, ARENA_SIZE]} />
      <Wall position={[ARENA_SIZE / 2, WALL_HEIGHT / 2, 0]} args={[WALL_THICKNESS, WALL_HEIGHT, ARENA_SIZE]} />

      {/* Ambient fog pillars for atmosphere */}
      {[-12, 12].map((x) =>
        [-12, 12].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 1.5, z]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 3, 8]} />
            <meshStandardMaterial color="#444" roughness={1} />
          </mesh>
        ))
      )}

      {/* Lighting */}
      <ambientLight intensity={1.8} />
      <pointLight position={[0, 8, 0]} intensity={6} color="#ff8855" castShadow />
      <pointLight position={[-10, 4, -10]} intensity={3} color="#2255aa" />
      <pointLight position={[10, 4, 10]} intensity={3} color="#2255aa" />
      <pointLight position={[0, 4, 0]} intensity={2} color="#ffffff" />
    </group>
  )
}

function Wall({ position, args }) {
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color="#2a2a2a" roughness={1} />
    </mesh>
  )
}
