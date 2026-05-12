import { useMemo } from 'react'
import * as THREE from 'three'

function seeded(seed) {
  let s = seed >>> 0
  return () => { s = Math.imul(s ^ (s >>> 17), 0x45d9f3b) ^ (s >>> 13); return (s >>> 0) / 0xffffffff }
}

function drawPine(ctx, x, baseY, maxW, h, color1, color2) {
  const LAYERS = 5
  const trunkH = h * 0.15
  ctx.fillStyle = '#020201'
  ctx.fillRect(x - 2, baseY - trunkH, 4, trunkH)
  for (let i = 0; i < LAYERS; i++) {
    const lw = maxW * (1 - (i / (LAYERS - 1)) * 0.55)
    const lh = (h * 0.85 / LAYERS) * 1.25
    const ly = baseY - trunkH - (h * 0.85 / LAYERS) * (i + 0.3)
    ctx.fillStyle = i % 2 === 0 ? color1 : color2
    ctx.beginPath()
    ctx.moveTo(x, ly - lh)
    ctx.lineTo(x + lw / 2, ly)
    ctx.lineTo(x - lw / 2, ly)
    ctx.closePath()
    ctx.fill()
  }
}

function buildForestTexture() {
  const W = 2048, H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Sky
  ctx.fillStyle = '#06090c'
  ctx.fillRect(0, 0, W, H)

  const rng = seeded(0xf04e57)
  const BASE_Y = H * 0.68

  // Far layer — darker, smaller; drawn first (behind)
  for (let i = 0; i < 90; i++) {
    // Wrap-safe: trees at x in [−W*0.05, W*1.05] so edges tile cleanly
    const x = ((rng() * 1.1 - 0.05) * W + W) % W
    const h = 70 + rng() * 100
    const w = 18 + rng() * 24
    drawPine(ctx, x, BASE_Y, w, h, '#050c04', '#040e05')
    // Mirror tree near opposite edge for seamless wrap
    if (x < W * 0.05) drawPine(ctx, x + W, BASE_Y, w, h, '#050c04', '#040e05')
    if (x > W * 0.95) drawPine(ctx, x - W, BASE_Y, w, h, '#050c04', '#040e05')
  }

  // Near layer — slightly lighter, taller
  for (let i = 0; i < 65; i++) {
    const x = ((rng() * 1.1 - 0.05) * W + W) % W
    const h = 130 + rng() * 160
    const w = 28 + rng() * 38
    drawPine(ctx, x, BASE_Y, w, h, '#071007', '#08120a')
    if (x < W * 0.05) drawPine(ctx, x + W, BASE_Y, w, h, '#071007', '#08120a')
    if (x > W * 0.95) drawPine(ctx, x - W, BASE_Y, w, h, '#071007', '#08120a')
  }

  // Ground fill
  const gnd = ctx.createLinearGradient(0, BASE_Y, 0, H)
  gnd.addColorStop(0, '#0a1508')
  gnd.addColorStop(1, '#060d05')
  ctx.fillStyle = gnd
  ctx.fillRect(0, BASE_Y, W, H - BASE_Y)

  // Dense mist rising from ground
  const mist = ctx.createLinearGradient(0, BASE_Y - H * 0.12, 0, H)
  mist.addColorStop(0, 'rgba(12,22,14,0)')
  mist.addColorStop(0.45, 'rgba(14,26,16,0.55)')
  mist.addColorStop(1, 'rgba(18,32,20,0.82)')
  ctx.fillStyle = mist
  ctx.fillRect(0, BASE_Y - H * 0.12, W, H - BASE_Y + H * 0.12)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

export default function ForestSkybox() {
  const texture = useMemo(() => buildForestTexture(), [])

  return (
    <group>
      <color attach="background" args={['#06090c']} />
      {/* Single cylinder — 1 draw call, BasicMaterial skips all lighting */}
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[38, 38, 24, 64, 1, true]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}
