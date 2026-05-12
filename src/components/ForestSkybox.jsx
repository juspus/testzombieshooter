import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

export default function ForestSkybox() {
  const texture = useTexture('/forest-panorama.png')
  texture.wrapS = THREE.RepeatWrapping
  texture.flipY = false

  return (
    <group>
      <color attach="background" args={['#06090c']} />
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[38, 38, 24, 64, 1, true]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}
