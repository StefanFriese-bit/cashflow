import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ymd, monthName } from './engine/dates';
import { money, parseAmount } from './engine/money';
import type { Currency, State } from './engine/types';

// ---------------- icons (stroke, 24px) ----------------
const P = (d: string) => <path d={d} />;
const ICONS: Record<string, ComponentChildren> = {
  today: [P('M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'), <circle cx="12" cy="12" r="4" />],
  weeks: [<rect x="3" y="4.5" width="18" height="16" rx="3" />, P('M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3')],
  list: [P('M9 6h11M9 12h11M9 18h11'), <circle cx="4.5" cy="6" r="1.2" />, <circle cx="4.5" cy="12" r="1.2" />, <circle cx="4.5" cy="18" r="1.2" />],
  us: [<circle cx="8.5" cy="8" r="3.2" />, <circle cx="16.5" cy="9" r="2.6" />, P('M2.5 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2M15 14.6c2.8-.4 5.6 1.1 6.3 4.9')],
  loans: [P('M3 10.5 12 4l9 6.5'), P('M5 10.5v8M9.5 10.5v8M14.5 10.5v8M19 10.5v8M3 20.5h18')],
  settings: [<circle cx="12" cy="12" r="3" />, P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  close: [P('M6 6l12 12M18 6 6 18')],
  plus: [P('M12 5v14M5 12h14')],
  bell: [P('M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'), P('M13.7 21a2 2 0 0 1-3.4 0')],
  alert: [P('M12 9v4M12 17h.01'), P('M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z')],
  calendarQ: [<rect x="3" y="4.5" width="18" height="16" rx="3" />, P('M3 9.5h18M8 2.5v4M16 2.5v4'), P('M10.3 13.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.3M12 18.4h.01')],
  chevron: [P('M9 6l6 6-6 6')],
  back: [P('M15 6l-6 6 6 6')],
  search: [<circle cx="11" cy="11" r="7" />, P('M20 20l-3.5-3.5')],
  arrowRight: [P('M5 12h14M13 6l6 6-6 6')],
  sync: [P('M20 11a8 8 0 0 0-14.3-4.9L4 8'), P('M4 3v5h5'), P('M4 13a8 8 0 0 0 14.3 4.9L20 16'), P('M20 21v-5h-5')],
  edit: [P('M4 20h4L19 9l-4-4L4 16v4z'), P('M13.5 6.5l4 4')],
  move: [<rect x="3" y="4.5" width="18" height="16" rx="3" />, P('M3 9.5h18M8 2.5v4M16 2.5v4M9 15h6M13 13l2 2-2 2')],
  skip: [<circle cx="12" cy="12" r="9" />, P('M5.6 5.6l12.8 12.8')],
  undo: [P('M9 14 4 9l5-5'), P('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')],
  download: [P('M12 4v11M7 10l5 5 5-5M5 20h14')],
  upload: [P('M12 20V9M7 14l5-5 5 5M5 4h14')],
  note: [P('M6 3h9l5 5v13H6z'), P('M14 3v6h6M9 13h7M9 17h5')],
};
export function Icon({ name, class: cls }: { name: string; class?: string }) {
  return (
    <svg class={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// ---------------- people ----------------
export function tone(state: State, person: string): 'a' | 'b' | '' {
  return state.people[person]?.tone || '';
}
export function Who({ state, person }: { state: State; person: string }) {
  const p = state.people[person];
  return (
    <span class={`who ${p?.tone || ''}`}>
      <span class={`pdot ${p?.tone || ''}`} />
      {p?.name || '—'}
    </span>
  );
}

export function DateBox({ date, today }: { date: string; today?: string }) {
  const [, m, d] = ymd(date);
  return (
    <div class={`datebox ${today === date ? 'today' : ''}`} aria-hidden="true">
      <div class="d">{d}</div>
      <div class="m">{monthName(m)}</div>
    </div>
  );
}

export function Money({ v, cur = 'GBP', plus, class: cls }: { v: number; cur?: Currency; plus?: boolean; class?: string }) {
  return <span class={`num ${cls || ''}`}>{money(v, cur, { plus })}</span>;
}

// ---------------- modal sheet ----------------
export function Sheet({ title, onClose, children, actions }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" ref={ref}>
        <div class="grab" />
        <div class="sh-head">
          <h2>{title}</h2>
          {actions}
          <button class="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div class="sh-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------- inputs ----------------
export function MoneyInput({ value, currency, onValue, onCurrency, autoFocus, label }: { value: number | null; currency: Currency; onValue: (v: number | null) => void; onCurrency?: (c: Currency) => void; autoFocus?: boolean; label?: string }) {
  const [text, setText] = useState(value === null || value === 0 ? '' : String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 250);
  }, []);
  return (
    <div class="money-in">
      {onCurrency ? (
        <button type="button" class="cur" onClick={() => onCurrency(currency === 'GBP' ? 'ZAR' : 'GBP')} aria-label={`Currency ${currency}, tap to change`}>
          {currency === 'GBP' ? '£' : 'R'}
        </button>
      ) : (
        <span class="cur" style={{ display: 'flex', alignItems: 'center' }}>
          {currency === 'GBP' ? '£' : 'R'}
        </span>
      )}
      <input
        ref={ref}
        inputMode="decimal"
        aria-label={label || 'Amount'}
        value={text}
        placeholder="0"
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value;
          setText(t);
          onValue(t.trim() === '' ? null : parseAmount(t));
        }}
      />
    </div>
  );
}

/** A labelled form row. `group` for rows holding buttons (a <label> would lend its text to the first button). */
export function Field({ label, hint, children, group }: { label: string; hint?: ComponentChildren; children: ComponentChildren; group?: boolean }) {
  if (group)
    return (
      <div class="field" role="group" aria-label={label}>
        <span>{label}</span>
        {children}
        {hint && <div class="hint">{hint}</div>}
      </div>
    );
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <div class="hint">{hint}</div>}
    </label>
  );
}

export function Switch({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="switch">
      <span class="t">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, full }: { value: T; options: { v: T; label: ComponentChildren }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div class={`seg ${full ? 'full' : ''}`} role="tablist">
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.v === value} class={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ kind, icon, children, action }: { kind: 'warn' | 'bad' | 'info'; icon?: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class={`banner ${kind}`}>
      {icon && <Icon name={icon} class="bi" />}
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}
