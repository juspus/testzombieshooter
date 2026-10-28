import { useFrame } from '@react-three/fiber'
import { impactMesh, spawnImpact, updateImpacts } from '../impactParticles'

// Pooled sparks / splinters / debris. Static emitter, like BulletTrails.add:
//   ImpactFX.spawn(point, normal, kind, intensity?)   kind: 'wall' | 'plank' | 'floor' | 'break'
export default function ImpactFX() {
  useFrame((_, delta) => updateImpacts(Math.min(delta, 0.05)))
  return <primitive object={impactMesh} />
}

ImpactFX.spawn = spawnImpact
