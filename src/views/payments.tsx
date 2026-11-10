import { useState } from 'preact/hooks';
import { nice, todayUK } from '../engine/dates';
import { money } from '../engine/money';
import { monthlyEquivalent, nextOccurrence, scheduleEndText, scheduleText } from '../engine/plan';
import type { Item, State } from '../engine/types';
import { live } from '../engine/types';
import { me, saveItem } from '../store';
import { Banner, Icon } from '../ui';
import { KIND_LABEL } from './editors';
import { groupRank } from './weeks';
import type { Nav } from '../app';

export type PayFilter = 'all' | 'unconfirmed' | 'nodate' | 'rand' | `p:${string}`;

export function Payments({ state, nav, initialFilter }: { state: State; nav: Nav; initialFilter?: PayFilter }) {
  const today = todayUK();
  const [filter, setFilter] = useState<PayFilter>(initialFilter || 'all');
  const [q, setQ] = useState('');
  const people = live(state.people);
  const all = live(state.items);
  const unconfirmed = all.filter((i) => !i.dayConfirmed && i.schedule.kind !== 'none');
  const nodate = all.filter((i) => i.schedule.kind === 'none');
  const match = (i: Item) => {
    if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'unconfirmed') return !i.dayConfirmed && i.schedule.kind !== 'none';
    if (filter === 'nodate') return i.schedule.kind === 'none';
    if (filter === 'rand') return i.currency === 'ZAR';
    if (filter.startsWith('p:')) return i.person === filter.slice(2);
    return true;
  };
  const items = all.filter(match).sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups: [string, Item[]][] = [];
  for (const i of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === i.group) last[1].push(i);
    else groups.push([i.group, [i]]);
  }
  const perMonth = (pid: string, kind: 'in' | 'out') =>
    all.filter((i) => i.person === pid && (kind === 'in' ? i.kind === 'income' : i.kind !== 'income')).reduce((s, i) => s + monthlyEquivalent(state, i, today), 0);

  return (
    <div>
      <div class="head">
        <div>
          <h1 class="title">Payments</h1>
          <p class="subtitle">Everything that goes in and out. Tap one to change its date, amount or who pays.</p>
        </div>
        <button class="btn primary" onClick={() => nav.newItem(filter.startsWith('p:') ? filter.slice(2) : me() || people[0]?.id)}>
          <Icon name="plus" /> Add
        </button>
      </div>

      {unconfirmed.length > 0 && filter !== 'unconfirmed' && (
        <Banner kind="warn" icon="calendarQ" action={<button class="btn small" onClick={() => setFilter('unconfirmed')}>Show</button>}>
          <b>{unconfirmed.length} dates are best guesses.</b> Your sheet only showed the week. Check each one — a tick means it is right.
        </Banner>
      )}
      {filter === 'unconfirmed' && (
        <Banner kind="info" icon="calendarQ">
          For each one: if the day is right, tap <b>Right</b>. If not, tap the payment and pick the day. {unconfirmed.length === 0 && <b>All done — every date is checked.</b>}
        </Banner>
      )}

      <div class="grid2" style={{ marginBottom: '12px' }}>
        {people.map((p) => (
          <div class="card flat" style={{ marginBottom: '0px', padding: '12px' }}>
            <div class="small" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 650 }}>
              <span class={`pdot ${p.tone}`} /> {p.name}
            </div>
            <div class="muted" style={{ fontSize: '11.5px' }}>a month, averaged over the next 12</div>
            <div class="num" style={{ fontSize: '20px', marginTop: '4px' }}>
              {money(perMonth(p.id, 'out'))} <span class="small muted" style={{ fontFamily: 'var(--text)' }}>out</span>
            </div>
            <div class="small muted">{money(perMonth(p.id, 'in'))} in</div>
          </div>
        ))}
      </div>

      <div class="search">
        <Icon name="search" />
        <input class="input" type="search" placeholder="Find a payment" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Find a payment" />
      </div>
      <div class="chips" role="tablist">
        {(
          [
            ['all', 'All', all.length],
            ...people.map((p) => [`p:${p.id}`, p.name, all.filter((i) => i.person === p.id).length] as const),
            ['unconfirmed', 'Day not confirmed', unconfirmed.length],
            ['rand', 'In rand', all.filter((i) => i.currency === 'ZAR').length],
            ['nodate', 'No date yet', nodate.length],
          ] as [PayFilter, string, number][]
        ).map(([v, label, n]) => (
          <button class={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)} role="tab" aria-selected={filter === v}>
            {v.startsWith('p:') && <span class={`pdot ${state.people[v.slice(2)]?.tone}`} />}
            {label} <span class="count">{n}</span>
          </button>
        ))}
      </div>

      {groups.map(([g, list]) => (
        <>
          <h2 class="section">
            {g} <small>{list.length}</small>
          </h2>
          <div class="card tight">
            {list.map((i) => (
              <PaymentRow state={state} i={i} today={today} nav={nav} quickConfirm={filter === 'unconfirmed'} />
            ))}
          </div>
        </>
      ))}
      {!groups.length && <div class="empty">Nothing matches.</div>}
    </div>
  );
}

function PaymentRow({ state, i, today, nav, quickConfirm }: { state: State; i: Item; today: string; nav: Nav; quickConfirm: boolean }) {
  const p = state.people[i.person];
  const next = nextOccurrence(state, i, today);
  const ended = !next && i.schedule.kind !== 'none';
  return (
    <div class="li tap" data-item={i.id}>
      <button class="grow" style={{ border: '0px', background: 'none', padding: '0px', textAlign: 'left', minWidth: '0px' }} onClick={() => nav.openItem(i.id)}>
        <div class="name">{i.name}</div>
        <div class="meta">
          <span class={`pdot ${p?.tone || ''}`} />
          <span>{p?.name}</span>
          <span>· {scheduleText(i.schedule)}</span>
          {scheduleEndText(i.schedule) && <span>· {scheduleEndText(i.schedule)}</span>}
        </div>
        <div class="meta">
          {next && <span>Next: {nice(next.date)}</span>}
          {ended && <span>No more payments planned</span>}
          {!i.dayConfirmed && i.schedule.kind !== 'none' && <span class="tag warn">Day not confirmed</span>}
          {i.schedule.kind === 'none' && <span class="tag">No date yet</span>}
          {i.kind !== 'bill' && <span class="tag">{KIND_LABEL[i.kind]}</span>}
          {i.remind && i.kind !== 'budget' && i.kind !== 'income' && <Icon name="bell" class="muted" />}
        </div>
      </button>
      <button class="amt" style={{ border: '0px', background: 'none', padding: '0px' }} onClick={() => nav.openItem(i.id)}>
        <span class={i.kind === 'income' ? 'pos' : ''}>{i.amount ? money(i.amount, i.currency) : '—'}</span>
        {i.currency === 'ZAR' && i.amount > 0 && <small>≈ {money(i.amount / state.settings.rate)}</small>}
      </button>
      {quickConfirm && !i.dayConfirmed && (
        <button class="btn small good" onClick={() => saveItem({ ...i, dayConfirmed: true })} aria-label={`The date for ${i.name} is right`}>
          <Icon name="check" /> Right
        </button>
      )}
    </div>
  );
}
