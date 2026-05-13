import { useMemo } from 'react'
import * as THREE from 'three'

const SKYBOX_RADIUS = 92
const SKYBOX_HEIGHT = 70
const TEXTURE_WIDTH = 2048
const TEXTURE_HEIGHT = 512

const palette = {
  skyTop: '#040713',
  skyMid: '#080d20',
  skyLow: '#121522',
  moon: '#56606c',
  cloud: '#10121d',
  farTree: '#061011',
  midTree: '#040b0b',
  nearTree: '#010505',
  bark: '#101817',
  twig: '#0b1110',
  ground: '#050807',
  leaf1: '#111008',
  leaf2: '#171108',
  leaf3: '#0d120c',
}

function createRandom(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function drawPixelLine(ctx, x0, y0, x1, y1, color, width = 1) {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
  ctx.fillStyle = color

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = Math.round(x0 + dx * t)
    const y = Math.round(y0 + dy * t)
    ctx.fillRect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width)
  }
}

function drawPine(ctx, x, baseY, height, width, color, trunkColor) {
  const tiers = Math.max(4, Math.floor(height / 30))
  ctx.fillStyle = color

  for (let i = 0; i < tiers; i += 1) {
    const top = baseY - Math.floor(height * (i + 1) / tiers)
    const bottom = baseY - Math.floor(height * i / tiers)
    const tierWidth = Math.floor(width * (1 - i / (tiers + 0.4)))

    for (let y = top; y < bottom; y += 3) {
      const span = Math.floor(tierWidth * ((y - top + 3) / Math.max(8, bottom - top)))
      ctx.fillRect(x - span, y, span * 2, 3)
    }
  }

  ctx.fillStyle = trunkColor
  ctx.fillRect(x - Math.max(2, Math.floor(width / 18)), baseY - Math.floor(height / 3), Math.max(4, Math.floor(width / 9)), 44)
}

function drawDeadTree(ctx, rng, x, baseY, height, width, color, highlight) {
  const lean = Math.floor(rng() * 36) - 18
  const topX = x + lean
  const topY = baseY - height

  drawPixelLine(ctx, x, baseY, topX, topY, color, width)

  for (const side of [-1, 1]) {
    drawPixelLine(ctx, x, baseY - 4, x + side * (10 + Math.floor(rng() * 24)), baseY + Math.floor(rng() * 14), color, Math.max(2, Math.floor(width / 2)))
  }

  const branches = 7 + Math.floor(rng() * 7)
  for (let i = 0; i < branches; i += 1) {
    const t = 0.14 + rng() * 0.72
    const branchX = Math.floor(x + lean * t + rng() * 8 - 4)
    const branchY = Math.floor(baseY - height * t)
    const side = rng() < 0.5 ? -1 : 1
    const endX = branchX + side * (width * (4 + rng() * 8)) + rng() * 20 - 10
    const endY = branchY - (12 + rng() * 58)

    drawPixelLine(ctx, branchX, branchY, endX, endY, color, Math.max(1, Math.floor(width / 2)))

    const twigs = 1 + Math.floor(rng() * 3)
    for (let j = 0; j < twigs; j += 1) {
      const twigT = rng()
      const twigX = branchX * (1 - twigT) + endX * twigT
      const twigY = branchY * (1 - twigT) + endY * twigT
      drawPixelLine(ctx, twigX, twigY, twigX + side * (8 + rng() * 24), twigY - (5 + rng() * 22), highlight, 1)
    }
  }
}

function makeForestTexture() {
  if (typeof document === 'undefined') return null

  const rng = createRandom(7319)
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  const sky = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT)
  sky.addColorStop(0, palette.skyTop)
  sky.addColorStop(0.56, palette.skyMid)
  sky.addColorStop(1, palette.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  // Blocky horizontal sky bands and a muted crescent moon.
  for (let y = 0; y < TEXTURE_HEIGHT; y += 4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.05 + Math.sin(y * 0.035) * 0.025})`
    ctx.fillRect(0, y, TEXTURE_WIDTH, 4)
  }

  const moonX = TEXTURE_WIDTH * 0.73
  const moonY = TEXTURE_HEIGHT * 0.18
  const glow = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 150)
  glow.addColorStop(0, 'rgba(86, 96, 108, 0.28)')
  glow.addColorStop(1, 'rgba(86, 96, 108, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  ctx.fillStyle = palette.moon
  ctx.beginPath()
  ctx.arc(moonX, moonY, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = palette.skyMid
  ctx.beginPath()
  ctx.arc(moonX + 9, moonY - 4, 17, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < 190; i += 1) {
    ctx.fillStyle = rng() < 0.78 ? '#344050' : '#4c525e'
    ctx.fillRect(Math.floor(rng() * TEXTURE_WIDTH), Math.floor(12 + rng() * 214), rng() < 0.85 ? 1 : 2, 1)
  }

  for (let band = 0; band < 11; band += 1) {
    const y = 55 + rng() * 235
    const height = 4 + rng() * 11
    ctx.fillStyle = palette.cloud
    for (let x = 0; x < TEXTURE_WIDTH; x += 8) {
      const wave = Math.sin(x * 0.012 + band) + 0.55 * Math.sin(x * 0.031 + rng() * 4)
      if (wave > rng() - 0.55) {
        ctx.fillRect(x, y + wave * 6, 8 + rng() * 24, height)
      }
    }
  }

  // Distant rolling hill silhouette.
  ctx.fillStyle = '#030808'
  for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
    const hillY = 318 + 18 * Math.sin((x / TEXTURE_WIDTH) * Math.PI * 4 + 1.5) + 10 * Math.sin((x / TEXTURE_WIDTH) * Math.PI * 10)
    ctx.fillRect(x, hillY, 1, TEXTURE_HEIGHT - hillY)
  }

  for (let x = -40; x < TEXTURE_WIDTH + 40; x += 17) {
    drawPine(ctx, x, 358 + rng() * 30, 84 + rng() * 82, 16 + rng() * 30, palette.farTree, '#050b0b')
  }

  for (let x = -45; x < TEXTURE_WIDTH + 45; x += 22) {
    if (rng() < 0.58) {
      drawPine(ctx, x + rng() * 12 - 6, 392 + rng() * 28, 118 + rng() * 138, 28 + rng() * 48, palette.midTree, '#040908')
    } else {
      drawDeadTree(ctx, rng, x + rng() * 16 - 8, 400 + rng() * 28, 128 + rng() * 142, 3 + rng() * 6, palette.midTree, palette.twig)
    }
  }

  for (let x = -65; x < TEXTURE_WIDTH + 65; x += 36) {
    if (rng() < 0.48) {
      drawPine(ctx, x + rng() * 26 - 13, 440 + rng() * 34, 210 + rng() * 170, 54 + rng() * 70, palette.nearTree, '#030807')
    } else {
      drawDeadTree(ctx, rng, x + rng() * 22 - 11, 440 + rng() * 38, 225 + rng() * 200, 7 + rng() * 9, palette.nearTree, palette.bark)
    }
  }

  ctx.fillStyle = palette.ground
  ctx.fillRect(0, 410, TEXTURE_WIDTH, 102)
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = [palette.leaf1, palette.leaf2, palette.leaf3, palette.ground][Math.floor(rng() * 4)]
    ctx.fillRect(rng() * TEXTURE_WIDTH, 410 + rng() * 102, 2 + rng() * 5, 1 + rng() * 3)
  }

  for (let x = 0; x < TEXTURE_WIDTH; x += 11) {
    const baseY = 450 + rng() * 62
    for (let i = 0; i < 2 + rng() * 4; i += 1) {
      drawPixelLine(ctx, x + rng() * 12 - 6, baseY, x + rng() * 30 - 15, baseY - 20 - rng() * 48, palette.nearTree, 1)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return texture
}

export default function ForestSkybox() {
  const texture = useMemo(() => makeForestTexture(), [])

  if (!texture) return null

  return (
    <mesh position={[0, 22, 0]} frustumCulled={false} renderOrder={-100}>
      <cylinderGeometry args={[SKYBOX_RADIUS, SKYBOX_RADIUS, SKYBOX_HEIGHT, 96, 1, true]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  )
}
