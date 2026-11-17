import { useFrame } from '@react-three/fiber'
import { impactMesh, updateImpacts } from '../impactParticles'

// Pooled sparks / splinters / debris. Spawn through impactParticles.spawnImpact(point, normal, kind, intensity?)
// (kind: 'wall' | 'plank' | 'floor' | 'break' | 'metal'); this component only draws and steps them.
export default function ImpactFX() {
  useFrame((_, delta) => updateImpacts(Math.min(delta, 0.05)))
  return <primitive object={impactMesh} />
}

