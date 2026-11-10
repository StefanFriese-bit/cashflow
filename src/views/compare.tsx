import { useState } from 'preact/hooks';
import { addMonths, monthEnd, monthName, monthStart, ymd } from '../engine/dates';
import { money } from '../engine/money';
import { monthSummary, occurrences, type MonthSummary } from '../engine/plan';
import type { State } from '../engine/types';
import { live } from '../engine/types';
import { Icon, Seg } from '../ui';
import { OccRow } from './rows';
import { groupRank } from './weeks';
import type { Nav } from '../app';

function typical(state: State, today: string): Record<string, MonthSummary> {
  const acc: Record<string, MonthSummary> = {};
  const first = monthStart(addMonths(today, 1));
  for (let i = 0; i < 12; i++) {
    const m = monthSummary(state, addMonths(first, i));
    for (const [pid, r] of Object.entries(m)) {
      const a = (acc[pid] ||= { month: first, person: pid, income: 0, out: 0, saved: 0, byGroup: {}, left: 0 });
      a.income += r.income / 12;
      a.out += r.out / 12;
      a.saved += r.saved / 12;
      a.left += r.left / 12;
      for (const [g, v] of Object.entries(r.byGroup)) a.byGroup[g] = (a.byGroup[g] || 0) + v / 12;
    }
  }
  return acc;
}

export function Compare({ state, today, nav }: { state: State; today: string; nav: Nav }) {
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<'month' | 'typical'>('month');
  const people = live(state.people).sort((a, b) => (a.tone < b.tone ? -1 : 1));
  const month = monthStart(addMonths(today, offset));
  const [y, m] = ymd(month);
  const sum = mode === 'month' ? monthSummary(state, month) : typical(state, today);
  const [listFor, setListFor] = useState<string>(people[0]?.id || '');
  const [L, R] = people;
  if (!L || !R) return null;
  const groups = [...new Set(people.flatMap((p) => Object.keys(sum[p.id]?.byGroup || {})))].sort((a, b) => groupRank(a) - groupRank(b));
  const max = Math.max(1, ...groups.flatMap((g) => people.map((p) => sum[p.id]?.byGroup[g] || 0)));
  const row = (label: string, a: number, b: number, signed = false) => (
    <div class="kv" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '16px' }}>
      <span>{label}</span>
      <b class={`num ${signed && a < 0 ? 'neg' : ''}`} style={{ minWidth: '76px', textAlign: 'right' }}>{money(a)}</b>
      <b class={`num ${signed && b < 0 ? 'neg' : ''}`} style={{ minWidth: '76px', textAlign: 'right' }}>{money(b)}</b>
    </div>
  );
  const a = sum[L.id];
  const b = sum[R.id];
  const occs = mode === 'month' ? occurrences(state, month, monthEnd(month)).filter((o) => o.item.person === listFor) : [];
  const house = (p: string) => sum[p]?.byGroup['House'] || 0;
  const houseTotal = house(L.id) + house(R.id);

  return (
    <div>
      <h1 class="title">
        {L.name} &amp; {R.name}
      </h1>
      <p class="subtitle">Who pays what, side by side.</p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <Seg value={mode} onChange={setMode} options={[{ v: 'month', label: 'One month' }, { v: 'typical', label: 'Typical month' }]} />
        {mode === 'month' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button class="iconbtn" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}>
              <Icon name="back" />
            </button>
            <b style={{ minWidth: '120px', textAlign: 'center' }}>
              {monthName(m, true)} {y}
            </b>
            <button class="iconbtn" aria-label="Next month" onClick={() => setOffset((o) => o + 1)}>
              <Icon name="chevron" />
            </button>
          </div>
        )}
      </div>
      {mode === 'typical' && <p class="muted small" style={{ marginTop: '-6px' }}>The average of the next 12 months — like the “story” totals at the bottom of your sheet, worked out from the real dates.</p>}

      <div class="cols">
        <div>
          <div class="card">
            <div class="kv" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '16px' }}>
              <span />
              <span class="who a" style={{ minWidth: '76px', justifyContent: 'flex-end' }}>
                <span class="pdot a" />
                {L.name}
              </span>
              <span class="who b" style={{ minWidth: '76px', justifyContent: 'flex-end' }}>
                <span class="pdot b" />
                {R.name}
              </span>
            </div>
            {row('Money in', a.income, b.income)}
            {row('Payments & spending', -a.out, -b.out)}
            {row('Put aside', -a.saved, -b.saved)}
            <hr class="sep" style={{ margin: '6px 0' }} />
            {row('Left over', a.left, b.left, true)}
          </div>

          {houseTotal > 0 && (
            <div class="card">
              <div class="eyebrow" style={{ marginBottom: '8px' }}>House costs — who carries them</div>
              <div class="bar" style={{ height: '14px' }}>
                <i style={{ width: `${(house(L.id) / houseTotal) * 100}%`, background: 'var(--a)' }} />
                <i style={{ width: `${(house(R.id) / houseTotal) * 100}%`, background: 'var(--b)' }} />
              </div>
              <div class="legend" style={{ marginTop: '8px', justifyContent: 'space-between' }}>
                <span>
                  <i style={{ background: 'var(--a)' }} /> {L.name} {Math.round((house(L.id) / houseTotal) * 100)}% · {money(house(L.id))}
                </span>
                <span>
                  <i style={{ background: 'var(--b)' }} /> {R.name} {Math.round((house(R.id) / houseTotal) * 100)}% · {money(house(R.id))}
                </span>
              </div>
            </div>
          )}
        </div>

        <div class="card">
          <div class="eyebrow" style={{ marginBottom: '6px' }}>Where it goes</div>
          {groups.map((g) => {
            const va = a.byGroup[g] || 0;
            const vb = b.byGroup[g] || 0;
            return (
              <div class="vs">
                <div class="l">
                  <span class="v">{va ? money(va) : '—'}</span>
                  <span class="track">
                    <i style={{ width: `${(va / max) * 100}%`, background: 'var(--a)' }} />
                  </span>
                </div>
                <div class="mid">{g}</div>
                <div class="r">
                  <span class="track">
                    <i style={{ width: `${(vb / max) * 100}%`, background: 'var(--b)' }} />
                  </span>
                  <span class="v">{vb ? money(vb) : '—'}</span>
                </div>
              </div>
            );
          })}
          <div class="legend" style={{ marginTop: '8px', justifyContent: 'center' }}>
            <span>
              <i style={{ background: 'var(--a)' }} /> {L.name}
            </span>
            <span>
              <i style={{ background: 'var(--b)' }} /> {R.name}
            </span>
          </div>
        </div>
      </div>

      {mode === 'month' && (
        <>
          <h2 class="section" style={{ justifyContent: 'space-between' }}>
            <span>In {monthName(m, true)}</span>
            <Seg value={listFor} onChange={setListFor} options={people.map((p) => ({ v: p.id, label: <><span class={`pdot ${p.tone}`} />{p.name}</> }))} />
          </h2>
          <div class="card tight">
            {occs.map((o) => (
              <OccRow state={state} o={o} today={today} onOpen={nav.openOcc} />
            ))}
            {!occs.length && <div class="empty">Nothing this month.</div>}
          </div>
        </>
      )}
    </div>
  );
}
