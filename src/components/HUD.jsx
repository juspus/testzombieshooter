import { useEffect, useState } from 'react'
import { useGameStore, zombieTypesForWave, CLIP_SIZE, AK_CLIP, DEAGLE_CLIP, SHOTGUN_CLIP, PLANK_COST, STRONG_PLANK_COST, CALIBER_LABELS, COMBO_WINDOW, comboMultiplier } from '../store'

const BASE_KNIFE_COOLDOWN = 0.4
const KNIFE_MASTERY_COOLDOWN = 0.25

function getIsMobileHud() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

export default function HUD() {
  const [isMobile, setIsMobile] = useState(getIsMobileHud)
  const phase = useGameStore((s) => s.phase)
  const wave = useGameStore((s) => s.wave)
  const waveKills = useGameStore((s) => s.waveKills)
  const zombieCount = useGameStore((s) => s.zombies.length)
  const total = useGameStore((s) => s.getZombiesForWave())
  const bulletsInClip = useGameStore((s) => s.bulletsInClip)
  const reserveBullets = useGameStore((s) => s.reserveBullets)
  const isReloading = useGameStore((s) => s.isReloading)
  const nearWindowId = useGameStore((s) => s.nearWindowId)
  const windowPlanks = useGameStore((s) => s.windowPlanks)
  const windowPlankStrong = useGameStore((s) => s.windowPlankStrong)
  const strongPlanksMode = useGameStore((s) => s.strongPlanksMode)
  const boardingProgress = useGameStore((s) => s.boardingProgress)
  const money = useGameStore((s) => s.money)
  const weapon = useGameStore((s) => s.weapon)
  const ownedWeapons = useGameStore((s) => s.ownedWeapons)
  const activeItem = useGameStore((s) => s.activeItem)
  const perks = useGameStore((s) => s.perks)
  const knifeCooldown = useGameStore((s) => s.knifeCooldown)
  const nearChest = useGameStore((s) => s.nearChest)
  const comboCount = useGameStore((s) => s.comboCount)
  const comboTimer = useGameStore((s) => s.comboTimer)
  const knifeCooldownMax = perks.knife_mastery ? KNIFE_MASTERY_COOLDOWN : BASE_KNIFE_COOLDOWN
  const showCombo = comboCount >= 5
  const multiplier = comboMultiplier(comboCount)
  const comboBarFrac = comboTimer / COMBO_WINDOW
  const clipSize = weapon === 'ak47' ? AK_CLIP : weapon === 'deagle' ? DEAGLE_CLIP : weapon === 'shotgun' ? SHOTGUN_CLIP : CLIP_SIZE
  const nearPlankCount = nearWindowId >= 0 ? (windowPlanks[nearWindowId] ?? 0) : 0
  const nearPlanksAreStrong = nearWindowId >= 0 ? (windowPlankStrong[nearWindowId] ?? false) : false
  const canAddPlank = nearPlankCount < 2
  const canUpgrade = strongPlanksMode && nearPlankCount > 0 && !nearPlanksAreStrong
  const showBoardPrompt = nearWindowId >= 0 && (canAddPlank || canUpgrade) && !nearChest
  const activeCost = strongPlanksMode ? STRONG_PLANK_COST : PLANK_COST
  const upgradeCost = STRONG_PLANK_COST * nearPlankCount
  const canAfford = canUpgrade ? money >= upgradeCost : money >= activeCost
  const unlockedTypes = zombieTypesForWave(wave)
  const topBarStyle = isMobile ? { ...styles.topBar, ...styles.mobileTopBar } : styles.topBar
  const statStyle = isMobile ? { ...styles.stat, ...styles.mobileStat } : styles.stat
  const labelStyle = isMobile ? { ...styles.label, ...styles.mobileLabel } : styles.label
  const valueStyle = isMobile ? { ...styles.value, ...styles.mobileValue } : styles.value
  const showTopBar = !(isMobile && phase === 'intermission')
  const ammoBoxStyle = isMobile ? { ...styles.ammoBox, ...styles.mobileAmmoBox } : styles.ammoBox
  const weaponLabelStyle = isMobile ? { ...styles.weaponLabel, ...styles.mobileWeaponLabel } : styles.weaponLabel
  const ammoCountStyle = isMobile ? { ...styles.ammoCount, ...styles.mobileAmmoCount } : styles.ammoCount
  const reloadHintStyle = isMobile ? { ...styles.reloadHint, ...styles.mobileReloadHint } : styles.reloadHint
  const pipsStyle = isMobile ? { ...styles.pips, ...styles.mobilePips } : styles.pips
  const pipStyle = isMobile ? { ...styles.pip, ...styles.mobilePip } : styles.pip
  const barOuterStyle = isMobile ? { ...styles.barOuter, ...styles.mobileBarOuter } : styles.barOuter

  useEffect(() => {
    const update = () => setIsMobile(getIsMobileHud())
    const media = window.matchMedia?.('(hover: none) and (pointer: coarse)')
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    media?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      media?.removeEventListener?.('change', update)
    }
  }, [])

  return (
    <div style={styles.hud}>
      {/* Crosshair */}
      <div style={styles.crosshairH} />
      <div style={styles.crosshairV} />

      {/* Top bar */}
      {showTopBar && (
        <div style={topBarStyle}>
          <div style={statStyle}>
            <span style={labelStyle}>WAVE</span>
            <span style={valueStyle}>{wave}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>KILLS</span>
            <span style={valueStyle}>{waveKills} / {total}</span>
          </div>
          <div style={statStyle}>
            <span style={labelStyle}>MONEY</span>
            <span style={{ ...valueStyle, color: canAfford ? '#ffe066' : '#ff6644' }}>
              €{money.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {unlockedTypes.length > 0 && (
        <div style={styles.threatBox}>
          <span style={styles.threatLabel}>THREATS</span>
          <span style={styles.threatValue}>
            {unlockedTypes.map((type) => type.toUpperCase()).join(' · ')}
          </span>
        </div>
      )}

      {/* Combo multiplier — above ammo box */}
      {showCombo && (
        <div style={{ ...styles.comboBox, ...(isMobile ? styles.mobileComboBox : {}) }}>
          <div style={styles.comboLabel}>
            <span style={styles.comboX}>×{multiplier.toFixed(1)}</span>
            <span style={styles.comboKills}>{comboCount} COMBO</span>
          </div>
          <div style={styles.comboTrack}>
            <div style={{ ...styles.comboFill, width: `${comboBarFrac * 100}%` }} />
          </div>
        </div>
      )}

      {/* Weapon info — bottom right */}
      {activeItem === 'knife' ? (
        <div style={ammoBoxStyle}>
          <div style={weaponLabelStyle}>KNIFE</div>
          {knifeCooldown > 0 ? (
            <>
              <div style={{ ...ammoCountStyle, color: '#ff6600', fontSize: isMobile ? 13 : 20, letterSpacing: isMobile ? 1.5 : 3 }}>
                COOLDOWN
              </div>
              <div style={{ ...styles.cooldownTrack, ...(isMobile ? styles.mobileCooldownTrack : {}) }}>
                <div style={{
                  ...styles.cooldownFill,
                  width: `${Math.max(0, Math.min(1, (knifeCooldownMax - knifeCooldown) / knifeCooldownMax)) * 100}%`,
                }} />
              </div>
            </>
          ) : (
            <div style={{ ...ammoCountStyle, color: '#00ff88', fontSize: isMobile ? 13 : 20, letterSpacing: isMobile ? 1.5 : 3 }}>
              READY
            </div>
          )}
          {!isMobile && <div style={reloadHintStyle}>Q — switch to gun{perks.knife_mastery ? ' · mastery' : ''}</div>}
        </div>
      ) : weapon === 'flamethrower' ? (
        <div style={ammoBoxStyle}>
          <div style={weaponLabelStyle}>FLAMETHROWER</div>
          <div style={styles.caliberLabel}>{CALIBER_LABELS.flamethrower}</div>
          <div style={{
            ...ammoCountStyle,
            color: reserveBullets === 0 ? '#ff3300' : reserveBullets <= 150 ? '#ffaa00' : '#fff',
          }}>
            {Math.ceil(reserveBullets)}<span style={styles.ammoSep}> fuel</span>
          </div>
          {!isMobile && (
            <div style={styles.reloadHint}>
              {ownedWeapons.length > 1 ? 'Scroll — switch · ' : ''}Q — knife
            </div>
          )}
        </div>
      ) : (
        <div style={ammoBoxStyle}>
          <div style={weaponLabelStyle}>{weapon === 'ak47' ? 'AK-47' : weapon === 'deagle' ? 'DESERT EAGLE' : weapon === 'shotgun' ? 'SHOTGUN' : 'PISTOL'}</div>
          <div style={styles.caliberLabel}>{CALIBER_LABELS[weapon]}</div>
          {isReloading ? (
            <div style={{ ...styles.reloading, ...(isMobile ? styles.mobileReloading : {}) }}>RELOADING…</div>
          ) : (
            <div style={{
              ...ammoCountStyle,
              color: bulletsInClip === 0 ? '#ff3300' : bulletsInClip <= 3 ? '#ffaa00' : '#fff',
            }}>
              {bulletsInClip}<span style={styles.ammoSep}>/</span>{bulletsInClip + reserveBullets}
            </div>
          )}
          {/* Bullet pip row — hidden on mobile */}
          {!isMobile && (
            <div style={{ ...pipsStyle, flexWrap: 'wrap', maxWidth: clipSize <= 10 ? 'auto' : 90 }}>
              {Array.from({ length: clipSize }).map((_, i) => (
                <div key={i} style={{
                  ...pipStyle,
                  background: i < bulletsInClip ? '#ffe066' : '#333',
                }} />
              ))}
            </div>
          )}
          {!isMobile && (
            <div style={styles.reloadHint}>
              {ownedWeapons.length > 1 ? 'Scroll — switch · ' : ''}R — reload · Q — knife
            </div>
          )}
        </div>
      )}

      {/* Chest prompt */}
      {nearChest && !showBoardPrompt && (
        <div style={{ ...styles.boardPrompt, ...(isMobile ? styles.mobileBoardPrompt : {}), borderColor: '#5a3a10', bottom: isMobile ? 8 : 90 }}>
          <span style={{ color: '#c8801a' }}>{isMobile ? 'USE — open chest' : 'E — open supply chest'}</span>
        </div>
      )}

      {/* Window board prompt */}
      {showBoardPrompt && (
        <div style={{ ...styles.boardPrompt, ...(isMobile ? styles.mobileBoardPrompt : {}), borderColor: canAfford ? (strongPlanksMode ? '#446688' : '#554400') : '#552200' }}>
          <span style={{ color: canAfford ? (strongPlanksMode ? '#aaccee' : '#ffe066') : '#ff6644' }}>
            {canUpgrade
              ? canAfford
                ? isMobile ? `UPGRADE STRONG €${upgradeCost.toFixed(2)}` : `HOLD E — upgrade to STRONG (€${upgradeCost.toFixed(2)})`
                : isMobile ? `NEED €${upgradeCost.toFixed(2)}` : `NOT ENOUGH MONEY — €${upgradeCost.toFixed(2)} needed`
              : canAfford
                ? isMobile ? `BOARD [${nearPlankCount}/2] €${activeCost.toFixed(2)}${strongPlanksMode ? ' ⚡' : ''}` : `HOLD E — board window (€${activeCost.toFixed(2)}) [${nearPlankCount}/2]${strongPlanksMode ? ' ⚡' : ''}`
                : isMobile ? `NEED €${activeCost.toFixed(2)}` : `NOT ENOUGH MONEY — €${activeCost.toFixed(2)} needed`}
          </span>
          {canAfford && (
            <div style={styles.boardBar}>
              <div style={{ ...styles.boardBarFill, width: `${boardingProgress * 100}%`, background: strongPlanksMode ? '#aaccee' : '#ffe066' }} />
            </div>
          )}
        </div>
      )}

      {/* Bottom hint */}
      {!isMobile && <div style={styles.hint}>WASD to move · Mouse to aim · Click to shoot</div>}

      {/* Zombie count bar */}
      <div style={barOuterStyle}>
        <div
          style={{
            ...styles.barInner,
            width: `${((total - zombieCount) / total) * 100}%`,
          }}
        />
      </div>
    </div>
  )
}

const styles = {
  hud: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 20,
    height: 2,
    background: 'rgba(255,255,255,0.85)',
  },
  crosshairV: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 2,
    height: 20,
    background: 'rgba(255,255,255,0.85)',
  },
  threatBox: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(30,0,0,0.45)',
    border: '1px solid rgba(140,30,20,0.5)',
    borderRadius: 6,
    padding: '7px 18px',
    fontFamily: 'Courier New, monospace',
  },
  threatLabel: {
    color: '#c66',
    fontSize: 10,
    letterSpacing: 3,
  },
  threatValue: {
    color: '#ffb088',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  topBar: {
    display: 'flex',
    gap: 60,
    marginTop: 20,
    background: 'rgba(0,0,0,0.55)',
    padding: '12px 40px',
    borderRadius: 8,
    border: '1px solid #333',
  },
  mobileTopBar: {
    gap: 8,
    marginTop: 'max(6px, env(safe-area-inset-top))',
    padding: '4px 8px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.46)',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  mobileStat: {
    minWidth: 38,
    gap: 0,
  },
  label: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
  },
  mobileLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
  },
  value: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Courier New, monospace',
    letterSpacing: 2,
  },
  mobileValue: {
    fontSize: 13,
    letterSpacing: 1,
    lineHeight: 1.05,
  },
  hint: {
    position: 'absolute',
    bottom: 50,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'Courier New, monospace',
  },
  barOuter: {
    position: 'absolute',
    bottom: 30,
    width: 300,
    height: 6,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  mobileBarOuter: {
    bottom: 8,
    width: 120,
    height: 3,
  },
  barInner: {
    height: '100%',
    background: '#00ff88',
    transition: 'width 0.2s',
    borderRadius: 3,
  },
  ammoBox: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    fontFamily: 'Courier New, monospace',
  },
  mobileAmmoBox: {
    // Center at the very bottom of the screen, above the kill bar
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'max(22px, calc(env(safe-area-inset-bottom) + 16px))',
    right: 'auto',
    alignItems: 'center',
    gap: 0,
    padding: '2px 10px 3px',
    borderRadius: 5,
    background: 'rgba(0,0,0,0.40)',
    border: '1px solid rgba(255,255,255,0.09)',
    whiteSpace: 'nowrap',
  },
  weaponLabel: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 0,
  },
  caliberLabel: {
    color: '#c8801a',
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 2,
  },
  mobileWeaponLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    marginBottom: 0,
  },
  ammoCount: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
    lineHeight: 1,
  },
  mobileAmmoCount: {
    fontSize: 17,
    letterSpacing: 1,
  },
  ammoSep: {
    color: '#555',
    margin: '0 2px',
    fontSize: 24,
  },
  reserve: {
    color: '#888',
    fontSize: 13,
    letterSpacing: 1,
  },
  reloading: {
    color: '#ffaa00',
    fontSize: 18,
    letterSpacing: 4,
    fontWeight: 'bold',
    animation: 'none',
  },
  mobileReloading: {
    fontSize: 12,
    letterSpacing: 2,
  },
  reloadHint: {
    color: '#444',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
  },
  mobileReloadHint: {
    display: 'none',
  },
  boardPrompt: {
    position: 'absolute',
    bottom: 90,
    background: 'rgba(0,0,0,0.6)',
    color: '#ffe066',
    fontSize: 14,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
    padding: '8px 18px 10px',
    borderRadius: 4,
    border: '1px solid #554400',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 220,
  },
  mobileBoardPrompt: {
    bottom: 8,
    fontSize: 9,
    letterSpacing: 1,
    padding: '3px 9px 4px',
    borderRadius: 3,
    gap: 3,
    minWidth: 0,
  },
  boardBar: {
    width: '100%',
    height: 5,
    background: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  boardBarFill: {
    height: '100%',
    background: '#ffe066',
    borderRadius: 3,
    transition: 'width 0.05s linear',
  },
  pips: {
    display: 'flex',
    gap: 3,
    marginTop: 4,
  },
  mobilePips: {
    gap: 2,
    marginTop: 1,
    justifyContent: 'flex-end',
  },
  pip: {
    width: 6,
    height: 14,
    borderRadius: 2,
    transition: 'background 0.1s',
  },
  mobilePip: {
    width: 3,
    height: 7,
    borderRadius: 1,
  },
  cooldownTrack: {
    width: 100,
    height: 6,
    background: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  mobileCooldownTrack: {
    width: 56,
    height: 4,
    marginTop: 3,
  },
  cooldownFill: {
    height: '100%',
    background: '#ff6600',
    borderRadius: 3,
    transition: 'width 0.05s linear',
  },
  comboBox: {
    position: 'absolute',
    bottom: 160,
    right: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 5,
    fontFamily: 'Courier New, monospace',
  },
  mobileComboBox: {
    bottom: 'max(120px, calc(env(safe-area-inset-bottom) + 110px))',
    right: 8,
    gap: 3,
  },
  comboLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
  },
  comboX: {
    color: '#ffcc00',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
    lineHeight: 1,
    textShadow: '0 0 8px rgba(255,200,0,0.7)',
  },
  comboKills: {
    color: '#ff9900',
    fontSize: 10,
    letterSpacing: 3,
  },
  comboTrack: {
    width: 90,
    height: 4,
    background: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  comboFill: {
    height: '100%',
    background: '#ffcc00',
    borderRadius: 2,
    transition: 'width 0.05s linear',
  },
}
