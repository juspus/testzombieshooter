import { useGameStore, AK_COST, AK_CLIP, DEAGLE_COST, DEAGLE_CLIP, AMMO_PACK_COST, AMMO_PACK_AMOUNT, STRONG_PLANK_COST } from '../store'

const ITEMS = [
  {
    id: 'ak47',
    name: 'AK-47',
    desc: `Full-auto rifle. 2 body shots to kill. ${AK_CLIP}-round magazine.`,
    price: AK_COST,
    oneTime: true,
  },
  {
    id: 'deagle',
    name: 'Desert Eagle',
    desc: `Semi-auto hand cannon. Pierces up to 3 enemies. Instant kill. ${DEAGLE_CLIP}-round magazine.`,
    price: DEAGLE_COST,
    oneTime: true,
  },
  {
    id: 'ammo_pack',
    name: 'Ammo Pack',
    desc: `${AMMO_PACK_AMOUNT} rounds added to reserve.`,
    price: AMMO_PACK_COST,
    oneTime: false,
  },
]

export default function Shop() {
  const shopOpen = useGameStore((s) => s.shopOpen)
  const closeShop = useGameStore((s) => s.closeShop)
  const buyItem = useGameStore((s) => s.buyItem)
  const money = useGameStore((s) => s.money)
  const weapon = useGameStore((s) => s.weapon)
  const strongPlanksMode = useGameStore((s) => s.strongPlanksMode)
  const toggleStrongPlanksMode = useGameStore((s) => s.toggleStrongPlanksMode)

  if (!shopOpen) return null

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) closeShop() }}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.title}>SUPPLY CHEST</div>
          <div style={styles.money}>€{money.toFixed(2)}</div>
        </div>

        <div style={styles.items}>
          {ITEMS.map((item) => {
            const owned = item.oneTime && weapon === item.id
            const canAfford = money >= item.price
            const disabled = owned || !canAfford
            return (
              <div key={item.id} style={{ ...styles.card, opacity: disabled && !owned ? 0.55 : 1 }}>
                <div style={styles.itemIcon}>{item.id === 'ak47' ? '🔫' : '📦'}</div>
                <div style={styles.itemName}>{item.name}</div>
                <div style={styles.itemDesc}>{item.desc}</div>
                <div style={styles.itemPrice}>€{item.price.toFixed(2)}</div>
                <button
                  style={{
                    ...styles.buyBtn,
                    ...(owned ? styles.ownedBtn : !canAfford ? styles.cantAffordBtn : styles.canBuyBtn),
                  }}
                  disabled={disabled}
                  onClick={() => buyItem(item.id)}
                >
                  {owned ? 'OWNED' : 'BUY'}
                </button>
              </div>
            )
          })}

          {/* Strong Planks toggle */}
          <div style={{ ...styles.card, border: strongPlanksMode ? '1px solid #778899' : '1px solid #3a2a10' }}>
            <div style={styles.itemIcon}>🔩</div>
            <div style={styles.itemName}>STRONG PLANKS</div>
            <div style={styles.itemDesc}>
              Metal-reinforced boards. {`€${STRONG_PLANK_COST.toFixed(2)}`} per plank, withstands 20 hits.
              Existing planks can also be upgraded.
            </div>
            <div style={{ ...styles.itemPrice, color: strongPlanksMode ? '#778899' : '#ffe066' }}>
              {strongPlanksMode ? 'ACTIVE' : `€${STRONG_PLANK_COST.toFixed(2)} / plank`}
            </div>
            <button
              style={{
                ...styles.buyBtn,
                ...(strongPlanksMode ? styles.strongActiveBtn : styles.canBuyBtn),
              }}
              onClick={toggleStrongPlanksMode}
            >
              {strongPlanksMode ? 'DISABLE' : 'ENABLE'}
            </button>
          </div>
        </div>

        <div style={styles.hint}>E / ESC — close shop</div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  panel: {
    background: 'rgba(15,10,5,0.97)',
    border: '1px solid #5a3a10',
    borderRadius: 10,
    padding: '28px 36px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    minWidth: 480,
    fontFamily: 'Courier New, monospace',
    boxShadow: '0 0 40px rgba(180,100,0,0.25)',
  },
  header: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#c8801a',
    fontSize: 20,
    letterSpacing: 6,
    fontWeight: 'bold',
  },
  money: {
    color: '#ffe066',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  items: {
    display: 'flex',
    gap: 16,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid #3a2a10',
    borderRadius: 8,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    width: 180,
    transition: 'opacity 0.2s',
  },
  itemIcon: {
    fontSize: 36,
  },
  itemName: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  itemDesc: {
    color: '#777',
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 1.5,
    flexGrow: 1,
  },
  itemPrice: {
    color: '#ffe066',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  buyBtn: {
    width: '100%',
    padding: '9px 0',
    border: 'none',
    borderRadius: 4,
    fontSize: 13,
    letterSpacing: 3,
    fontFamily: 'Courier New, monospace',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  canBuyBtn: {
    background: '#c8801a',
    color: '#000',
  },
  cantAffordBtn: {
    background: '#2a2a2a',
    color: '#555',
    cursor: 'default',
  },
  ownedBtn: {
    background: '#1a3a0a',
    color: '#4a8a2a',
    cursor: 'default',
  },
  strongActiveBtn: {
    background: '#1a2a35',
    color: '#778899',
  },
  hint: {
    color: '#444',
    fontSize: 11,
    letterSpacing: 3,
  },
}
