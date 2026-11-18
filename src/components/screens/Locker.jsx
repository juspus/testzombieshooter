// Locker (cosmetics) panel.
import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../store'
import { track } from '../../analytics'
import { CROSSHAIR_COLORS, SUPPORTER_SKU, isUnlocked, itemsOfKind, unlockText } from '../../cosmetics'
import { signInWithGoogle, fetchEntitlements, fetchStoreConfig, startCheckout } from '../../supabase'
import { Button, SectionLabel, LockIcon } from '../ui'
import { CheckIcon, StarIcon } from '../Icons'

// ── Locker (cosmetics) ──────────────────────────────────────────────────────
// Cosmetics only: nothing here changes a gameplay number. Paid items sit next
// to a free sibling earned by playing. No timers, no scarcity copy, no popups.

const CROSSHAIR_GLYPHS = { cross: '+', dot: '●', chevron: '⌃', circle: '◎' }

const CHECKOUT_ERRORS = {
  already_owned: 'Already owned',
  checkout_unavailable: 'Checkout unavailable',
  unauthorized: 'Sign in again',
}

function LockerTile({ kind, item, selected, unlocked, onEquip }) {
  const swatchColor = item.swatch ?? item.hex
  const isCrosshair = kind === 'crosshair'
  return (
    <button
      type="button"
      data-testid={`locker-${kind}-${item.id}`}
      aria-pressed={selected}
      aria-disabled={!unlocked}
      onClick={() => unlocked && onEquip(kind, item.id)}
      title={unlocked ? item.blurb ?? item.label : `Locked — ${unlockText(item)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: 'clamp(62px, 15vmin, 90px)',
        minHeight: 44,  // >= 40px tap target on phones
        padding: 'clamp(5px, 1.2vmin, 9px) clamp(4px, 1vmin, 8px)',
        background: selected ? 'rgba(255,51,0,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? '#ff3300' : 'rgba(255,255,255,0.14)'}`,
        borderRadius: 4,
        color: unlocked ? (selected ? '#fff' : '#bbb') : '#555',
        fontFamily: 'Courier New, monospace',
        fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.8vmin, 12px))',
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: unlocked ? 'pointer' : 'not-allowed',
      }}
    >
      <span style={{ height: 'clamp(12px, 2.6vmin, 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: unlocked ? 1 : 0.4 }}>
        {isCrosshair ? (
          <span style={{ fontSize: 'clamp(12px, 2.6vmin, 18px)', lineHeight: 1 }}>{CROSSHAIR_GLYPHS[item.id]}</span>
        ) : swatchColor ? (
          <span style={{
            width: 'clamp(12px, 2.6vmin, 18px)',
            height: 'clamp(12px, 2.6vmin, 18px)',
            borderRadius: kind === 'crosshairColor' ? '50%' : 3,
            background: swatchColor,
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: kind === 'knifeSkin' && (item.id === 'ember' || item.id === 'bloodied') ? `0 0 6px ${item.swatch}` : 'none',
          }} />
        ) : null}
      </span>
      <span>{item.label}{selected ? <> <CheckIcon /></> : ''}</span>
      {!unlocked && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 'max(var(--ui-fs-min), clamp(7px, 1.3vmin, 9px))', color: '#777', letterSpacing: 0, textAlign: 'center', lineHeight: 1.2 }}>
          <LockIcon /> {unlockText(item)}
        </span>
      )}
    </button>
  )
}

function LockerRow({ title, children }) {
  return (
    <div style={{ marginBottom: 'clamp(8px, 1.8vmin, 14px)' }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(4px, 1vmin, 8px)' }}>
        {children}
      </div>
    </div>
  )
}

export function LockerPanel({ user, notice }) {
  const cosmetics = useGameStore((s) => s.cosmetics)
  const stats = useGameStore((s) => s.stats)
  const entitlements = useGameStore((s) => s.entitlements)
  const setCosmetic = useGameStore((s) => s.setCosmetic)
  const [config, setConfig] = useState(null)   // { checkoutEnabled, priceLabel } once loaded
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const viewTracked = useRef(false)

  useEffect(() => {
    if (viewTracked.current) return
    viewTracked.current = true
    track('locker_open')
    if (!useGameStore.getState().entitlements.includes(SUPPORTER_SKU)) track('supporter_cta_view')
  }, [])

  useEffect(() => {
    let alive = true
    fetchStoreConfig().then((c) => { if (alive) setConfig(c) })
    return () => { alive = false }
  }, [])

  const ctx = { entitlements, stats }
  const owned = entitlements.includes(SUPPORTER_SKU)
  const priceLabel = config?.priceLabel ?? '€4.99'

  const equip = (kind, id) => {
    if (setCosmetic(kind, id)) track('cosmetic_equip', { kind, id })
  }

  const renderTiles = (kind, items) =>
    items.map((item) => (
      <LockerTile
        key={item.id}
        kind={kind}
        item={item}
        selected={cosmetics[kind] === item.id}
        unlocked={isUnlocked(item, ctx)}
        onEquip={equip}
      />
    ))

  const handleSupport = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    track('checkout_start')
    try {
      await startCheckout()  // redirects the page on success
    } catch (err) {
      const code = err?.message ?? ''
      if (code === 'already_owned') fetchEntitlements().then((l) => useGameStore.getState().setEntitlements(l)).catch(() => {})
      setError(CHECKOUT_ERRORS[code] ?? (code.includes(' ') ? code : 'Try again'))
      setBusy(false)
    }
  }

  const supportBtn = (props) => <Button variant="gold" style={{ marginTop: 'clamp(8px, 1.6vmin, 12px)' }} {...props} />
  let button
  if (owned) {
    button = supportBtn({ disabled: true, children: <><StarIcon /> Supporter</> })
  } else if (!config) {
    button = supportBtn({ disabled: true, children: '…' })
  } else if (!config.checkoutEnabled) {
    button = supportBtn({ disabled: true, children: 'Coming soon' })
  } else if (!user) {
    button = supportBtn({ onClick: () => signInWithGoogle(), children: 'Sign in to support' })
  } else {
    button = supportBtn({ onClick: handleSupport, disabled: busy, children: busy ? '…' : `Support ${priceLabel}` })
  }

  return (
    <div>
      {notice && (
        <div style={{ marginBottom: 10, color: '#88cc44', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.9vmin, 13px))', letterSpacing: 1, textAlign: 'center' }}>
          {notice}
        </div>
      )}

      <LockerRow title="Weapon finish">{renderTiles('skin', itemsOfKind('skin'))}</LockerRow>
      <LockerRow title="Crosshair">{renderTiles('crosshair', itemsOfKind('crosshair'))}</LockerRow>
      <LockerRow title="Crosshair colour">{renderTiles('crosshairColor', CROSSHAIR_COLORS)}</LockerRow>
      <LockerRow title="Knife">{renderTiles('knifeSkin', itemsOfKind('knifeSkin'))}</LockerRow>

      <div style={{ padding: 'clamp(8px, 1.8vmin, 14px) 0 0', borderTop: '1px solid var(--ui-line)', textAlign: 'center' }}>
        <div style={{ color: '#ffd166', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.9vmin, 13px))', letterSpacing: 3, fontWeight: 'bold' }}>
          SUPPORT THE DEV — {priceLabel} · one-time
        </div>
        <div style={{ color: '#888', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.6vmin, 11px))', letterSpacing: 1, lineHeight: 1.6, marginTop: 4 }}>
          Gold &amp; Obsidian finishes · Dot, Chevron &amp; Circle crosshairs · Red &amp; Cyan colours · Ember knife · leaderboard badge
        </div>
        <div style={{ color: '#666', fontSize: 'max(var(--ui-fs-min), clamp(8px, 1.5vmin, 10px))', letterSpacing: 1, marginTop: 2 }}>
          Cosmetics only — the whole game stays free.
        </div>
        {button}
        {error && (
          <div role="alert" style={{ color: '#ff6644', fontSize: 'max(var(--ui-fs-min), clamp(9px, 1.7vmin, 12px))', letterSpacing: 1, marginTop: 6 }}>{error}</div>
        )}
      </div>
    </div>
  )
}
