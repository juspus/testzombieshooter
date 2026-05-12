import { useMemo } from 'react'

const TRUNK = '#040302'
const PINE  = '#060d06'
const PINE2 = '#08100a'  // slightly lighter inner layer
const MIST  = '#141f16'

function seeded(seed) {
  let s = seed >>> 0
  return () => { s = Math.imul(s ^ (s >>> 17), 0x45d9f3b) ^ (s >>> 13); return (s >>> 0) / 0xffffffff }
}

function PineTree({ x, z, h, ry }) {
  const trunkH = h * 0.20
  const crownH = h * 0.80
  const LAYERS = 5
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      <mesh position={[0, trunkH / 2, 0]}>
        <boxGeometry args={[0.30, trunkH, 0.30]} />
        <meshStandardMaterial color={TRUNK} roughness={1} />
      </mesh>
      {Array.from({ length: LAYERS }, (_, i) => {
        const t   = i / (LAYERS - 1)
        const w   = (1.8 - t * 1.1) * (h / 5.5)
        const lh  = (crownH / LAYERS) * 1.15
        const y   = trunkH + (crownH / LAYERS) * (i + 0.4)
        return (
          <mesh key={i} position={[0, y, 0]}>
            <boxGeometry args={[w, lh, w]} />
            <meshStandardMaterial color={i % 2 === 0 ? PINE : PINE2} roughness={1} />
          </mesh>
        )
      })}
    </group>
  )
}

export default function ForestSkybox() {
  const trees = useMemo(() => {
    const rng = seeded(0xf0rest)
    return Array.from({ length: 56 }, (_, i) => {
      const angle  = (i / 56) * Math.PI * 2 + (rng() - 0.5) * 0.3
      const radius = 22 + rng() * 14
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: 4.5 + rng() * 6.0,
        ry: rng() * Math.PI * 2,
      }
    })
  }, [])

  // Second, denser ring close to the cabin walls — visible through windows
  const innerTrees = useMemo(() => {
    const rng = seeded(0xc10se)
    return Array.from({ length: 24 }, (_, i) => {
      const angle  = (i / 24) * Math.PI * 2 + (rng() - 0.5) * 0.4
      const radius = 13 + rng() * 6
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: 3.5 + rng() * 4.0,
        ry: rng() * Math.PI * 2,
      }
    })
  }, [])

  const mists = useMemo(() => {
    const rng = seeded(0xm1st)
    return Array.from({ length: 18 }, () => {
      const angle  = rng() * Math.PI * 2
      const radius = 10 + rng() * 16
      return {
        x:  Math.cos(angle) * radius,
        z:  Math.sin(angle) * radius,
        w:  7 + rng() * 10,
        d:  4 + rng() * 7,
        h:  0.5 + rng() * 1.0,
        y:  0.15 + rng() * 0.5,
        op: 0.10 + rng() * 0.22,
      }
    })
  }, [])

  return (
    <group>
      {/* Scene background — dark overcast night sky */}
      <color attach="background" args={['#06090c']} />

      {trees.map((t, i)      => <PineTree key={`o${i}`} {...t} />)}
      {innerTrees.map((t, i) => <PineTree key={`n${i}`} {...t} />)}

      {mists.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, m.z]}>
          <boxGeometry args={[m.w, m.h, m.d]} />
          <meshStandardMaterial
            color={MIST}
            roughness={1}
            transparent
            opacity={m.op}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
