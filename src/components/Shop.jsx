import { useGameStore, AK_COST, AK_CLIP, DEAGLE_COST, DEAGLE_CLIP, SHOTGUN_COST, SHOTGUN_CLIP, AMMO_PACK_COST, AMMO_PACK_AMOUNT, STRONG_PLANK_COST } from '../store'

const ITEMS = [
  {
    id: 'ak47',
    name: 'AK-47',
    desc: `Full-auto · 2 body shots · ${AK_CLIP}-rd mag`,
    price: AK_COST,
    oneTime: true,
  },
  {
    id: 'deagle',
    name: 'Desert Eagle',
    desc: `Semi-auto · Instant kill · Pierces 3 · ${DEAGLE_CLIP}-rd mag`,
    price: DEAGLE_COST,
    oneTime: true,
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    desc: `Pump-action · 12 pellets/shot · ${SHOTGUN_CLIP}-shell mag`,
    price: SHOTGUN_COST,
    oneTime: true,
  },
  {
    id: 'ammo_pack',
    name: 'Ammo Pack',
    desc: `+${AMMO_PACK_AMOUNT} rounds to reserve`,
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
          <span style={styles.title}>SUPPLY CHEST</span>
          <span style={styles.money}>€{money.toFixed(2)}</span>
        </div>

        <div style={styles.divider} />

        <div style={styles.list}>
          {ITEMS.map((item) => {
            const owned = item.oneTime && weapon === item.id
            const canAfford = money >= item.price
            const disabled = owned || !canAfford
            return (
              <div key={item.id} style={{ ...styles.row, opacity: disabled && !owned ? 0.45 : 1 }}>
                <div style={styles.rowLeft}>
                  <span style={{ ...styles.rowName, color: owned ? '#4a8a2a' : '#ddd' }}>{item.name}</span>
                  <span style={styles.rowDesc}>{item.desc}</span>
                </div>
                <div style={styles.rowRight}>
                  <span style={{ ...styles.rowPrice, color: canAfford || owned ? '#ffe066' : '#884422' }}>
                    {owned ? '—' : `€${item.price.toFixed(2)}`}
                  </span>
                  <button
                    style={{ ...styles.btn, ...(owned ? styles.btnOwned : !canAfford ? styles.btnCant : styles.btnBuy) }}
                    disabled={disabled}
                    onClick={() => buyItem(item.id)}
                  >
                    {owned ? 'OWNED' : 'BUY'}
                  </button>
                </div>
              </div>
            )
          })}

          <div style={styles.divider} />

          {/* Strong Planks toggle */}
          <div style={styles.row}>
            <div style={styles.rowLeft}>
              <span style={{ ...styles.rowName, color: strongPlanksMode ? '#aaccee' : '#ddd' }}>Strong Planks</span>
              <span style={styles.rowDesc}>
                Metal-reinforced · €{STRONG_PLANK_COST.toFixed(2)}/plank · 20 hits · upgrades existing
              </span>
            </div>
            <div style={styles.rowRight}>
              <span style={{ ...styles.rowPrice, color: strongPlanksMode ? '#778899' : '#ffe066' }}>
                {strongPlanksMode ? 'ACTIVE' : `€${STRONG_PLANK_COST.toFixed(2)}`}
              </span>
              <button
                style={{ ...styles.btn, ...(strongPlanksMode ? styles.btnStrong : styles.btnBuy) }}
                onClick={toggleStrongPlanksMode}
              >
                {strongPlanksMode ? 'DISABLE' : 'ENABLE'}
              </button>
            </div>
          </div>
        </div>

        <div style={styles.divider} />
        <div style={styles.hint}>E / ESC — close</div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  panel: {
    background: 'rgba(10,8,4,0.98)',
    border: '1px solid #5a3a10',
    borderRadius: 8,
    padding: '22px 28px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: 500,
    fontFamily: 'Courier New, monospace',
    boxShadow: '0 0 40px rgba(180,100,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    color: '#c8801a',
    fontSize: 16,
    letterSpacing: 6,
    fontWeight: 'bold',
  },
  money: {
    color: '#ffe066',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  divider: {
    borderBottom: '1px solid #2a1a08',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 4px',
    gap: 16,
    borderBottom: '1px solid #1a1008',
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
  rowDesc: {
    color: '#666',
    fontSize: 10,
    letterSpacing: 1,
  },
  rowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexShrink: 0,
  },
  rowPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
    minWidth: 72,
    textAlign: 'right',
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
  btnBuy: {
    background: '#c8801a',
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
    color: '#3a3a3a',
    fontSize: 10,
    letterSpacing: 3,
    textAlign: 'center',
  },
}
