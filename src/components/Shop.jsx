import { useEffect, useRef, useState } from 'react'
import { useGameStore, AK_COST, AK_CLIP, DEAGLE_COST, DEAGLE_CLIP, SHOTGUN_COST, SHOTGUN_CLIP, AMMO_PACK_COST, AMMO_PACK_AMOUNT, DEEP_POCKETS_AMMO_PACK_AMOUNT, PERK_COSTS, STRONG_PLANK_COST, CALIBER_LABELS } from '../store'

const ITEMS = [
  {
    id: 'ak47',
    name: 'AK-47',
    desc: `${CALIBER_LABELS.ak47} · Full-auto · 2 body shots · ${AK_CLIP}-rd mag`,
    price: AK_COST,
    oneTime: true,
  },
  {
    id: 'deagle',
    name: 'Desert Eagle',
    desc: `${CALIBER_LABELS.deagle} · Semi-auto · Instant kill · Pierces 3 · ${DEAGLE_CLIP}-rd mag`,
    price: DEAGLE_COST,
    oneTime: true,
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    desc: `${CALIBER_LABELS.shotgun} · Pump-action · 12 pellets/shot · ${SHOTGUN_CLIP}-shell mag`,
    price: SHOTGUN_COST,
    oneTime: true,
  },
  {
    id: 'ammo_pack',
    name: 'Ammo Pack',
    desc: (perks, weapon) => `${CALIBER_LABELS[weapon]} · +${perks.deep_pockets ? DEEP_POCKETS_AMMO_PACK_AMOUNT : AMMO_PACK_AMOUNT} rounds to reserve`,
    price: AMMO_PACK_COST,
    oneTime: false,
  },
]

function getIsMobileShop() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints > 0
  const mobileSized = Math.min(window.innerWidth, window.innerHeight) <= 900
  return Boolean(coarsePointer || (touchPoints && mobileSized))
}

const PERKS = [
  {
    id: 'fast_hands',
    name: 'Fast Hands',
    desc: 'Reload 33% faster',
    price: PERK_COSTS.fast_hands,
  },
  {
    id: 'deep_pockets',
    name: 'Deep Pockets',
    desc: `Ammo packs give +${DEEP_POCKETS_AMMO_PACK_AMOUNT} rounds`,
    price: PERK_COSTS.deep_pockets,
  },
  {
    id: 'iron_sights',
    name: 'Iron Sights',
    desc: 'Near-head hits count as headshots',
    price: PERK_COSTS.iron_sights,
  },
  {
    id: 'runners_breath',
    name: "Runner's Breath",
    desc: 'Move 15% faster',
    price: PERK_COSTS.runners_breath,
  },
  {
    id: 'carpenter',
    name: 'Carpenter',
    desc: 'Board windows 35% faster',
    price: PERK_COSTS.carpenter,
  },
  {
    id: 'knife_mastery',
    name: 'Knife Mastery',
    desc: 'Longer reach and quicker recovery',
    price: PERK_COSTS.knife_mastery,
  },
]

export default function Shop() {
  const [isMobile, setIsMobile] = useState(getIsMobileShop)
  const shopOpen = useGameStore((s) => s.shopOpen)
  const closeShop = useGameStore((s) => s.closeShop)
  const buyItem = useGameStore((s) => s.buyItem)
  const buyPerk = useGameStore((s) => s.buyPerk)
  const money = useGameStore((s) => s.money)
  const weapon = useGameStore((s) => s.weapon)
  const ownedWeapons = useGameStore((s) => s.ownedWeapons)
  const perks = useGameStore((s) => s.perks)
  const strongPlanksMode = useGameStore((s) => s.strongPlanksMode)
  const toggleStrongPlanksMode = useGameStore((s) => s.toggleStrongPlanksMode)

  useEffect(() => {
    const update = () => setIsMobile(getIsMobileShop())
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

  if (!shopOpen) return null

  const overlayStyle = isMobile ? { ...styles.overlay, ...styles.mobileOverlay } : styles.overlay
  const panelStyle = isMobile ? { ...styles.panel, ...styles.mobilePanel } : styles.panel
  const headerStyle = isMobile ? { ...styles.header, ...styles.mobileHeader } : styles.header
  const titleStyle = isMobile ? { ...styles.title, ...styles.mobileTitle } : styles.title
  const moneyStyle = isMobile ? { ...styles.money, ...styles.mobileMoney } : styles.money
  const rowStyle = isMobile ? { ...styles.row, ...styles.mobileRow } : styles.row
  const rowNameStyle = isMobile ? { ...styles.rowName, ...styles.mobileRowName } : styles.rowName
  const rowDescStyle = isMobile ? { ...styles.rowDesc, ...styles.mobileRowDesc } : styles.rowDesc
  const rowRightStyle = isMobile ? { ...styles.rowRight, ...styles.mobileRowRight } : styles.rowRight
  const rowPriceStyle = isMobile ? { ...styles.rowPrice, ...styles.mobileRowPrice } : styles.rowPrice
  const btnStyle = isMobile ? { ...styles.btn, ...styles.mobileBtn } : styles.btn

  return (
    <div style={overlayStyle} onClick={isMobile ? undefined : (e) => { if (e.target === e.currentTarget) closeShop() }}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>

        <div style={headerStyle}>
          <span style={titleStyle}>SUPPLY CHEST</span>
          <span style={moneyStyle}>€{money.toFixed(2)}</span>
          {isMobile && <button type="button" style={styles.closeBtn} onClick={closeShop}>×</button>}
        </div>

        <div style={styles.divider} />

        <div style={styles.list}>
          {ITEMS.map((item) => {
            const owned = item.oneTime && ownedWeapons.includes(item.id)
            const isActive = item.oneTime && weapon === item.id
            const canAfford = money >= item.price
            const disabled = owned || !canAfford
            return (
              <div key={item.id} style={{ ...rowStyle, opacity: disabled && !owned ? 0.45 : 1 }}>
                <div style={styles.rowLeft}>
                  <span style={{ ...rowNameStyle, color: isActive ? '#4a8a2a' : owned ? '#6aaa4a' : '#ddd' }}>
                    {item.name}{isActive ? ' ◆' : ''}
                  </span>
                  <span style={rowDescStyle}>{typeof item.desc === 'function' ? item.desc(perks, weapon) : item.desc}</span>
                </div>
                <div style={rowRightStyle}>
                  <span style={{ ...rowPriceStyle, color: canAfford || owned ? '#ffe066' : '#884422' }}>
                    {owned ? '—' : `€${item.price.toFixed(2)}`}
                  </span>
                  <button
                    style={{ ...btnStyle, ...(owned ? styles.btnOwned : !canAfford ? styles.btnCant : styles.btnBuy) }}
                    disabled={disabled}
                    onClick={() => buyItem(item.id)}
                  >
                    {isActive ? 'ACTIVE' : owned ? 'OWNED' : 'BUY'}
                  </button>
                </div>
              </div>
            )
          })}

          <div style={styles.divider} />

          <div style={styles.sectionLabel}>PERKS</div>
          {PERKS.map((perk) => {
            const owned = perks[perk.id]
            const canAfford = money >= perk.price
            const disabled = owned || !canAfford
            return (
              <div key={perk.id} style={{ ...rowStyle, opacity: disabled && !owned ? 0.45 : 1 }}>
                <div style={styles.rowLeft}>
                  <span style={{ ...rowNameStyle, color: owned ? '#4a8a2a' : '#ddd' }}>{perk.name}</span>
                  <span style={rowDescStyle}>{perk.desc}</span>
                </div>
                <div style={rowRightStyle}>
                  <span style={{ ...rowPriceStyle, color: canAfford || owned ? '#ffe066' : '#884422' }}>
                    {owned ? '—' : `€${perk.price.toFixed(2)}`}
                  </span>
                  <button
                    style={{ ...btnStyle, ...(owned ? styles.btnOwned : !canAfford ? styles.btnCant : styles.btnBuy) }}
                    disabled={disabled}
                    onClick={() => buyPerk(perk.id)}
                  >
                    {owned ? 'OWNED' : 'BUY'}
                  </button>
                </div>
              </div>
            )
          })}

          <div style={styles.divider} />
          {/* Strong Planks toggle */}
          <div style={rowStyle}>
            <div style={styles.rowLeft}>
              <span style={{ ...rowNameStyle, color: strongPlanksMode ? '#aaccee' : '#ddd' }}>Strong Planks</span>
              <span style={rowDescStyle}>
                Metal-reinforced · €{STRONG_PLANK_COST.toFixed(2)}/plank · 20 hits · upgrades existing
              </span>
            </div>
            <div style={rowRightStyle}>
              <span style={{ ...rowPriceStyle, color: strongPlanksMode ? '#778899' : '#ffe066' }}>
                {strongPlanksMode ? 'ACTIVE' : `€${STRONG_PLANK_COST.toFixed(2)}`}
              </span>
              <button
                style={{ ...btnStyle, ...(strongPlanksMode ? styles.btnStrong : styles.btnBuy) }}
                onClick={toggleStrongPlanksMode}
              >
                {strongPlanksMode ? 'DISABLE' : 'ENABLE'}
              </button>
            </div>
          </div>
        </div>

        <div style={styles.divider} />
        <div style={styles.hint}>{isMobile ? 'Tap × or outside to close' : 'E / ESC — close'}</div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  mobileOverlay: {
    position: 'fixed',
    background: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))',
    zIndex: 30,
    touchAction: 'none',
  },
  panel: {
    background: 'rgba(10,8,4,0.98)',
    border: '1px solid #5a3a10',
    borderRadius: 8,
    padding: '22px 28px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: 560,
    maxHeight: '82vh',
    overflowY: 'auto',
    fontFamily: 'Courier New, monospace',
    boxShadow: '0 0 40px rgba(180,100,0,0.2)',
  },
  mobilePanel: {
    width: 'min(540px, calc(var(--app-width, 100vw) - 20px))',
    maxHeight: 'calc(var(--app-height, 100dvh) - 16px)',
    padding: '10px 12px 8px',
    gap: 7,
    borderRadius: 10,
    background: 'linear-gradient(180deg, rgba(34,22,10,0.98), rgba(13,10,7,0.98))',
    border: '2px solid rgba(200,128,26,0.75)',
    boxShadow: '0 0 0 1px rgba(255,224,102,0.12), 0 0 28px rgba(0,0,0,0.55)',
    touchAction: 'pan-y',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  mobileHeader: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#c8801a',
    fontSize: 16,
    letterSpacing: 6,
    fontWeight: 'bold',
  },
  mobileTitle: {
    fontSize: 13,
    letterSpacing: 3,
    color: '#ffb347',
  },
  money: {
    color: '#ffe066',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  mobileMoney: {
    fontSize: 17,
    letterSpacing: 1,
    color: '#ffe066',
  },
  divider: {
    borderBottom: '1px solid #2a1a08',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sectionLabel: {
    color: '#775522',
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: 'bold',
    margin: '8px 4px 2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 4px',
    gap: 16,
    borderBottom: '1px solid #1a1008',
  },
  mobileRow: {
    padding: '7px 3px',
    gap: 8,
    background: 'rgba(255,255,255,0.025)',
    borderBottom: '1px solid rgba(200,128,26,0.16)',
  },
  rowLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  rowName: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  mobileRowName: {
    fontSize: 12,
    letterSpacing: 1.4,
  },
  rowDesc: {
    color: '#666',
    fontSize: 10,
    letterSpacing: 1,
  },
  mobileRowDesc: {
    color: '#9a8a72',
    fontSize: 9,
    letterSpacing: 0.4,
  },
  rowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexShrink: 0,
  },
  mobileRowRight: {
    gap: 7,
  },
  rowPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
    minWidth: 72,
    textAlign: 'right',
  },
  mobileRowPrice: {
    fontSize: 12,
    minWidth: 54,
  },
  btn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 3,
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
    cursor: 'pointer',
    minWidth: 72,
  },
  mobileBtn: {
    padding: '8px 9px',
    minWidth: 58,
    fontSize: 10,
    letterSpacing: 1.4,
    touchAction: 'manipulation',
  },
  closeBtn: {
    border: '1px solid rgba(255,224,102,0.35)',
    borderRadius: 999,
    width: 34,
    height: 34,
    background: 'rgba(255,255,255,0.12)',
    color: '#ffe8a3',
    fontSize: 22,
    lineHeight: 1,
    flexShrink: 0,
    touchAction: 'manipulation',
  },
  btnBuy: {
    background: '#d98d22',
    color: '#000',
  },
  btnCant: {
    background: '#1e1e1e',
    color: '#444',
    cursor: 'default',
  },
  btnOwned: {
    background: '#0e200a',
    color: '#3a6a1a',
    cursor: 'default',
  },
  btnStrong: {
    background: '#0e1a22',
    color: '#556677',
  },
  hint: {
    color: '#6f5a36',
    fontSize: 10,
    letterSpacing: 3,
    textAlign: 'center',
  },
}
