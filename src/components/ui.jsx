import './ui.css'

// Shared menu UI kit: one button component (fixed heights per size, so rows line up),
// one panel frame, tabs and radio-style option rows. Styles live in ui.css.

const cx = (...c) => c.filter(Boolean).join(' ')

/** variant: 'primary' | 'secondary' | 'gold' | 'ghost'; size: 'lg' | 'md' | 'sm'. */
export function Button({ variant = 'secondary', size = 'md', block = false, className, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={cx('ui-btn', `ui-btn--${variant}`, size !== 'md' && `ui-btn--${size}`, block && 'ui-btn--block', className)}
      {...rest}
    />
  )
}

/** Framed panel: title bar (+ optional action on the right) over a scrolling body. */
export function Panel({ title, action, tabs, children, testid, bodyStyle }) {
  return (
    <section className="ui-panel" data-testid={testid}>
      <header className="ui-panel__head">
        <span className="ui-panel__title">{title}</span>
        {action}
      </header>
      {tabs}
      <div className="ui-panel__body" style={bodyStyle}>{children}</div>
    </section>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="ui-tabs">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="ui-tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Radio-style row: label + sub line on the left, status on the right. */
export function Option({ label, sub, side, checked, locked, onClick, testid }) {
  return (
    <button
      type="button"
      role="radio"
      className="ui-option"
      aria-checked={!!checked}
      disabled={locked}
      onClick={onClick}
      data-testid={testid}
      data-active={checked ? '1' : '0'}
      data-locked={locked ? '1' : '0'}
    >
      <span>
        <span className="ui-option__label">{label}</span>
        {sub && <span className="ui-option__sub">{sub}</span>}
      </span>
      {side != null && <span className="ui-option__side">{side}</span>}
    </button>
  )
}

export function SectionLabel({ children, right, style }) {
  return (
    <div className="ui-section-label" style={style}>
      <span>{children}</span>{right != null && <span>{right}</span>}
    </div>
  )
}

export function LockIcon({ size = 10 }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 10 12" aria-label="Locked" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="5" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" />
      <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" />
    </svg>
  )
}
