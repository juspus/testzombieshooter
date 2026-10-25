import { test, expect } from '@playwright/test'

// Baseline health check for the autonomous-dev loop: starts a solo run, drives
// movement/combat for a bounded window, and fails on any crash or console error.
// This is NOT a substitute for judging whether something is fun — it only proves
// the game still runs.

test('solo run starts, survives combat, no console/page errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // Debug params (non-production only, see store.js applyDebugOverrides) give
  // a full clip + reserve ammo so the smoke test isn't gated on shop economy.
  await page.goto('/?money=500&weapon=ak47')

  await page.getByText('SOLO').click()

  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 10_000 })

  // Click the canvas to trigger requestPointerLock and start driving input.
  await canvas.click()

  // Move + shoot for a bounded window. Player.jsx listens on document/canvas
  // regardless of lock state, so this exercises movement and shoot code paths
  // even if headless pointer lock doesn't fully engage.
  const start = Date.now()
  while (Date.now() - start < 12_000) {
    await page.keyboard.down('KeyW')
    await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100)
    await page.mouse.down()
    await page.waitForTimeout(120)
    await page.mouse.up()
    await page.keyboard.up('KeyW')
  }

  // The canvas must still be there and the tab must not have crashed.
  await expect(canvas).toBeVisible()

  expect(errors, `console/page errors during playtest:\n${errors.join('\n')}`).toEqual([])
})
