// Firing: shoot() (weapon.fire(FIRE)), the knife, the flamethrower, mobile auto-shoot, cooldowns and the reload countdown.
// Moved verbatim out of components/Player.jsx.
import * as THREE from 'three'
import * as WR from '../weaponRules'
import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store'
import { gun, knife } from '../fxBus'
import { zombieRefs, setFlameHitHandler } from '../zombieRegistry'
import { zombieSystem } from '../zombieLive'
import { zombieHitFx, fxNet } from '../hitFx'
import { playEmptyClick, playKnifeSwing } from '../sounds'
import { WEAPONS } from '../weapons'
import { lineOfSightBlocked } from '../walls'
import { kick } from '../cameraFeel'
import { send, isConnected } from '../net'
import { mobileInput, mobileState } from '../mobileInput'
import { getSettings } from '../settings'
import { hitZombieRay } from '../hitboxes'
import { markerKind, registerHit, BULLET_WALLS, netSend, knifeCooldownForPerks, knifeRangeForPerks } from './constants'
import { deathSound, _centre, FIRE, FLAMETHROWER, _knifePoint, _knifeDir, _autoPos, _autoFwd, _autoDir, _autoNearRefs } from './fireContext'

export default function usePlayerFiring(P, requestLock) {
  const {
    camera,
    gl,
    phase,
    activeItem,
    shopOpen,
    windowPlanksRef,
    pausedRef,
    shopOpenRef,
    selfStatusRef,
    weapon,
    weaponRef,
    activeItemRef,
    perksRef,
    yaw,
    locked,
    reloadTimer,
  } = P

  const hitZombie = useGameStore((s) => s.hitZombie)
  const hitZombieFlame = useGameStore((s) => s.hitZombieFlame)
  const consumeFuel = useGameStore((s) => s.consumeFuel)

  const setKnifeCooldown = useGameStore((s) => s.setKnifeCooldown)
  const consumeBullet = useGameStore((s) => s.consumeBullet)

  const finishReload = useGameStore((s) => s.finishReload)

  const mouseHeldRef = useRef(false)
  const akFireTimerRef = useRef(0)
  const shotgunCooldownRef = useRef(0)
  const knifeCooldownRef = useRef(0)
  const autoShootCooldownRef = useRef(0)
  const autoDetectRC = useRef(null)
  if (!autoDetectRC.current) { autoDetectRC.current = new THREE.Raycaster(); autoDetectRC.current.far = 30 }

  useEffect(() => { mobileInput.autoShootHeld = false; autoShootCooldownRef.current = 0 }, [weapon])

  // Damage callback for FlameSpray's per-particle hits (it reads the zombies from zombieRegistry).
  useEffect(() => setFlameHitHandler((zid, baseDamage) => {
    const damage = baseDamage * WR.damageMult('flamethrower', !!useGameStore.getState().upgradedWeapons.flamethrower)
    const flameKill = useGameStore.getState().hitZombieFlame(zid, damage)
    if (flameKill) deathSound(zombieRefs, zid)
    registerHit(flameKill ? 'kill' : 'burn')
    zombieSystem.ignite(zid)
    netSend('hit_zombie_flame', { id: zid, damage })
  }), [])

  // Force-stop the flamethrower spray when the shop opens, the weapon is switched
  // away, or gameplay pauses — the per-frame block above only runs during active play.
  useEffect(() => {
    if (shopOpen || phase !== 'playing' || weapon !== 'flamethrower' || activeItem !== 'gun') {
      mouseHeldRef.current = false
      FLAMETHROWER.stop(FIRE)
    }
  }, [shopOpen, phase, weapon, activeItem])

  // Make sure the flamethrower sound never keeps playing after unmount
  useEffect(() => () => FLAMETHROWER.silence(), [])

  const shoot = useCallback(() => {
    if (pausedRef.current || selfStatusRef.current === 'dead') return
    const wpn = weaponRef.current
    const def = WEAPONS[wpn]
    const raycaster = FIRE.raycaster
    raycaster.setFromCamera(_centre, camera)

    if (def.cooldown > 0 && shotgunCooldownRef.current > 0) return

    if (useGameStore.getState().benchBusy) return   // gun is inside the Upgrade Bench
    if (!consumeBullet()) { playEmptyClick(); return }
    if (def.fireMode === 'spray') return   // the flamethrower sprays from the frame loop, never through here

    const upg = !!useGameStore.getState().upgradedWeapons[wpn]
    const dmgMult = WR.damageMult(wpn, upg)   // upgraded x2, crossbow bolt one-shots

    const muzzle = gun.getMuzzlePosition() ?? camera.position.clone().addScaledVector(raycaster.ray.direction, 0.5)
    gun.fire()
    kick(wpn)
    def.sounds.shot(upg)
    if (def.vibrate) navigator.vibrate?.(def.vibrate)
    if (isConnected()) send('remote_sound', {
      sound: 'gunshot',
      weapon: wpn,
      up: upg,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    })

    if (def.cooldown > 0) shotgunCooldownRef.current = def.cooldown

    // Everything gun-specific (pellets, pierce, bolts, hit effects) is in src/weapons/<gun>.js
    FIRE.camera = camera
    FIRE.muzzle = muzzle
    FIRE.upg = upg
    FIRE.dmgMult = dmgMult
    FIRE.weapon = wpn
    FIRE.perks = perksRef.current
    FIRE.windowPlanks = windowPlanksRef.current
    FIRE.bulletWalls = BULLET_WALLS
    FIRE.aimAssist = mobileState.active && getSettings().aimAssist
    FIRE.zombieRefs = zombieRefs
    FIRE.hitZombie = hitZombie
    def.fire(FIRE)
  }, [camera, hitZombie, consumeBullet, pausedRef, perksRef, selfStatusRef, weaponRef, windowPlanksRef])

  const knifeSwing = useCallback(() => {
    if (knifeCooldownRef.current > 0 || selfStatusRef.current !== 'alive') return

    knife.swing()
    playKnifeSwing()
    if (isConnected()) send('remote_sound', {
      sound: 'knife',
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    })
    const cooldown = knifeCooldownForPerks(perksRef.current)
    knifeCooldownRef.current = cooldown
    setKnifeCooldown(cooldown)

    // Melee hit: closest zombie within range and roughly in front of player
    const camPos = camera.position
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const zombiePos = new THREE.Vector3()
    let closestId = null, closestDist = Infinity

    for (const [id, ref] of Object.entries(zombieRefs)) {
      if (!ref) continue
      ref.getWorldPosition(zombiePos)
      zombiePos.y = camPos.y  // ignore height difference for range check
      const dist = camPos.distanceTo(zombiePos)
      if (dist > knifeRangeForPerks(perksRef.current)) continue
      const toZombie = zombiePos.clone().sub(camPos).normalize()
      if (fwd.dot(toZombie) < 0.1) continue  // must be in roughly forward 160° arc
      if (dist < closestDist) { closestDist = dist; closestId = id }
    }

    if (closestId !== null) {
      const kid = Number(closestId)
      const knifeKill = hitZombie(kid, true, 'knife')
      if (knifeKill) deathSound(zombieRefs, kid)
      registerHit(markerKind(knifeKill, false))
      const kref = zombieRefs[closestId]
      if (kref) {
        kref.getWorldPosition(_knifePoint)
        zombieHitFx(kid, _knifePoint, _knifeDir.copy(fwd), true, 'knife', closestDist)
      }
      netSend('hit_zombie', { id: kid, isHeadshot: true, source: 'knife', ...(kref ? fxNet(_knifePoint, fwd, closestDist, 'knife') : {}) })
    }
  }, [camera, hitZombie, setKnifeCooldown, perksRef, selfStatusRef, yaw])

  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.button !== 0) return
      if (shopOpenRef.current) return
      if (!locked.current) { requestLock(); return }
      if (phase !== 'playing') return
      if (activeItemRef.current === 'knife') {
        knifeSwing()
        return
      }
      if (WEAPONS[weaponRef.current].fireMode === 'spray') {
        mouseHeldRef.current = true
        return
      }
      shoot()
      mouseHeldRef.current = true
      akFireTimerRef.current = 0.1  // next AK shot in 0.1s
    }
    const onMouseUp = (e) => {
      if (e.button !== 0) return
      mouseHeldRef.current = false
    }
    gl.domElement.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      gl.domElement.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [gl, phase, requestLock, shoot, knifeSwing, activeItemRef, locked, shopOpenRef, weaponRef])

  function mobileFire(delta, mobilePressed) {
    if (mobilePressed.shoot && phase === 'playing') {
      if (activeItemRef.current === 'knife') {
        knifeSwing()
      } else {
        shoot()
        akFireTimerRef.current = 0.1
        autoShootCooldownRef.current = 0.4
      }
    }

    // Mobile auto-shoot: fires when a zombie is in the crosshair
    if (mobileState.active && getSettings().autoShoot && phase === 'playing' && activeItemRef.current === 'gun') {
      autoShootCooldownRef.current -= delta
      const curDef = WEAPONS[weaponRef.current]
      const isFlamethrower = curDef.fireMode === 'spray'
      const hasAmmo = isFlamethrower
        ? useGameStore.getState().reserveBullets > 0
        : useGameStore.getState().bulletsInClip > 0 && reloadTimer.current <= 0
      let hasTarget = false
      if (hasAmmo) {
        // Pre-filter: only test zombies in front and within range
        const camPos = camera.position
        const rangeSq = isFlamethrower ? curDef.flame.RANGE * curDef.flame.RANGE : 625
        _autoFwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
        let nearCount = 0
        for (const ref of Object.values(zombieRefs)) {
          if (!ref) continue
          _autoPos.setFromMatrixPosition(ref.matrixWorld)
          const dx = _autoPos.x - camPos.x, dz = _autoPos.z - camPos.z
          if (dx * dx + dz * dz > rangeSq) continue
          _autoDir.set(dx, 0, dz).normalize()
          if (_autoFwd.dot(_autoDir) < 0.1) continue
          _autoNearRefs[nearCount++] = ref
        }
        if (nearCount > 0) {
          const OFFSETS = [
            { x: 0, y: 0 }, { x: 0.04, y: 0 }, { x: -0.04, y: 0 },
            { x: 0, y: 0.04 }, { x: 0, y: -0.04 },
          ]
          outer: for (const off of OFFSETS) {
            autoDetectRC.current.setFromCamera(off, camera)
            for (let i = 0; i < nearCount; i++) {
              const hit = hitZombieRay(autoDetectRC.current, _autoNearRefs[i])
              if (!hit) continue
              // Don't auto-shoot through walls — require a clear line of sight.
              if (lineOfSightBlocked(camPos.x, camPos.z, hit.point.x, hit.point.z, BULLET_WALLS)) continue
              hasTarget = true
              break outer
            }
          }
        }
      }
      if (hasTarget) {
        if (curDef.fireMode === 'auto' || isFlamethrower) {
          mobileInput.autoShootHeld = true
        } else if (autoShootCooldownRef.current <= 0) {
          shoot()
          autoShootCooldownRef.current = curDef.autoShootInterval
        }
      } else {
        mobileInput.autoShootHeld = false
      }
    } else if (mobileInput.autoShootHeld) {
      mobileInput.autoShootHeld = false
    }
  }

  function tickTimers(delta) {
    // Shotgun pump cooldown
    if (shotgunCooldownRef.current > 0) shotgunCooldownRef.current = Math.max(0, shotgunCooldownRef.current - delta)

    // Knife cooldown (tick + sync to store for HUD)
    if (knifeCooldownRef.current > 0) {
      knifeCooldownRef.current = Math.max(0, knifeCooldownRef.current - delta)
      setKnifeCooldown(knifeCooldownRef.current)
    }

    // Reload countdown
    if (reloadTimer.current > 0) {
      reloadTimer.current -= delta
      if (reloadTimer.current <= 0) {
        reloadTimer.current = 0
        finishReload()
      }
    }
  }

  function holdFire(delta) {
    // AK-47 auto-fire at 10 rounds/s while mouse held (deagle is semi-auto only; no auto-fire for knife)
    if (phase === 'playing' && WEAPONS[weaponRef.current].fireMode === 'auto' && activeItemRef.current === 'gun' && ((mouseHeldRef.current && locked.current) || mobileInput.shootHeld || mobileInput.autoShootHeld)) {
      akFireTimerRef.current -= delta
      if (akFireTimerRef.current <= 0) {
        shoot()
        akFireTimerRef.current = WEAPONS[weaponRef.current].fireInterval
      }
    }
  }

  function flame(delta, myStatus) {
    // Flamethrower — continuous spray while held, fuel-limited, cone damage ticks (src/weapons/flamethrower.js)
    {
      const firing = phase === 'playing' && myStatus !== 'dead' && weaponRef.current === 'flamethrower' && activeItemRef.current === 'gun' &&
        ((mouseHeldRef.current && locked.current) || mobileInput.shootHeld || mobileInput.autoShootHeld)
      FIRE.camera = camera
      FIRE.delta = delta
      FIRE.zombieRefs = zombieRefs
      FIRE.hitZombieFlame = hitZombieFlame
      FIRE.consumeFuel = consumeFuel
      if (firing && useGameStore.getState().reserveBullets > 0) FLAMETHROWER.fire(FIRE)
      else FLAMETHROWER.stop(FIRE)
      FLAMETHROWER.burn(FIRE, firing)
    }
  }

  return { mobileFire, tickTimers, holdFire, flame }
}
