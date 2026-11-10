import { relative, nice } from '../engine/dates';
import { money } from '../engine/money';
import type { Occ, State } from '../engine/types';
import { markPaid, unmarkPaid } from '../store';
import { DateBox, Icon } from '../ui';

/** One dated payment in a list: date, name, who, amount, and a tick to mark it paid. */
export function OccRow({ state, o, today, onOpen, showDate = true, showRelative = false }: { state: State; o: Occ; today: string; onOpen: (key: string) => void; showDate?: boolean; showRelative?: boolean }) {
  const p = state.people[o.item.person];
  const tickable = o.item.kind !== 'budget';
  const cur = o.item.currency;
  const rate = state.settings.rate;
  return (
    <div class={`li tap ${o.paid ? 'done' : ''}`} data-occ={o.key}>
      {showDate && <DateBox date={o.date} today={today} />}
      <button class="grow" style={{ border: '0px', background: 'none', padding: '0px', textAlign: 'left', minWidth: '0px' }} onClick={() => onOpen(o.key)}>
        <div class="name">{o.item.name}</div>
        <div class="meta">
          <span class={`pdot ${p?.tone || ''}`} />
          <span>{p?.name}</span>
          {showRelative && <span>· {relative(o.date, today)}</span>}
          {o.moved && !o.paid && <span class="tag">moved</span>}
          {o.changed && !o.paid && <span class="tag">changed</span>}
          {!o.item.dayConfirmed && !o.paid && <span class="tag warn">day?</span>}
          {o.item.kind === 'budget' && <span class="tag">budget</span>}
          {o.paid && <span>· paid {nice(o.paid.on)}</span>}
        </div>
      </button>
      <button class="amt" style={{ border: '0px', background: 'none', padding: '0px' }} onClick={() => onOpen(o.key)}>
        <span class={o.gbp > 0 ? 'pos' : ''}>{money(o.gbp > 0 ? o.amount : -o.amount, cur, { plus: true })}</span>
        {cur === 'ZAR' && <small>≈ {money(Math.abs(o.gbp))}</small>}
        {cur !== 'ZAR' && rate && null}
      </button>
      {tickable && (
        <button
          class={`tick ${o.paid ? 'on' : ''}`}
          aria-label={o.paid ? `${o.item.name}: paid — tap to undo` : `Mark ${o.item.name} as paid`}
          aria-pressed={!!o.paid}
          onClick={() => (o.paid ? unmarkPaid(o) : markPaid(o, o.amount, o.date <= today ? o.date : today))}
        >
          <Icon name="check" />
        </button>
      )}
    </div>
  );
}
