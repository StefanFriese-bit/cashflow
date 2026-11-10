import { useMemo, useState } from 'preact/hooks';
import { addDays, monthName, nice, weekLabel, weekStart } from '../engine/dates';
import { money } from '../engine/money';
import { weeks, type WeekRow } from '../engine/plan';
import type { Item, Occ, State } from '../engine/types';
import { live } from '../engine/types';
import { Seg } from '../ui';
import { OccRow } from './rows';
import type { Nav } from '../app';

export const GROUP_ORDER = ['Income', 'Monthly debits', 'SA payments', 'Cars', 'House', 'Tax', 'Savings', 'Living', 'Subscriptions'];
export function groupRank(g: string): number {
  const i = GROUP_ORDER.indexOf(g);
  return i < 0 ? 99 : i;
}

type Who = 'all' | string;

/** A week belongs to the month its Monday is in — the same as the sheet's columns. */
export const monthOf = (w: WeekRow) => w.start.slice(0, 7);
const mClass = (w: WeekRow) => `m${w.start.slice(5, 7)}`;
const monthTitle = (ym: string) => `${monthName(+ym.slice(5, 7), true)} ${ym.slice(0, 4)}`;

export function Weeks({ state, today, nav, wide }: { state: State; today: string; nav: Nav; wide: boolean }) {
  const [view, setView] = useState<'list' | 'sheet'>(() => (wide ? 'sheet' : 'list'));
  const [who, setWho] = useState<Who>('all');
  const [back, setBack] = useState(0);
  const [ahead, setAhead] = useState(16);
  const people = live(state.people);
  const start = addDays(weekStart(today), -7 * back);
  const rows = useMemo(() => weeks(state, start, back + ahead), [state, start, back, ahead]);
  const filt = (o: Occ) => who === 'all' || o.item.person === who;

  return (
    <div>
      <div class="head">
        <div>
          <h1 class="title">Weeks</h1>
          <p class="subtitle">Every payment, week by week — like the sheet, but it moves on by itself.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
        <Seg value={view} onChange={setView} options={[{ v: 'list', label: 'List' }, { v: 'sheet', label: 'Sheet' }]} />
        <Seg<Who>
          value={who}
          onChange={setWho}
          options={[{ v: 'all', label: 'Both' }, ...people.map((p) => ({ v: p.id, label: <><span class={`pdot ${p.tone}`} />{p.name}</> }))]}
        />
        {back === 0 && (
          <button class="btn small ghost" onClick={() => setBack(4)}>
            Show earlier weeks
          </button>
        )}
      </div>

      {view === 'sheet' ? (
        <SheetGrid state={state} rows={rows} today={today} who={who} nav={nav} />
      ) : (
        <div class="reveal">
          {rows.map((w, i) => (
            <>
              {(i === 0 || monthOf(rows[i - 1]) !== monthOf(w)) && <div class={`mhead ${mClass(w)}`}>{monthTitle(monthOf(w))}</div>}
              <WeekCard state={state} w={w} today={today} filt={filt} nav={nav} who={who} />
            </>
          ))}
        </div>
      )}
      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <button class="btn" onClick={() => setAhead((a) => a + 16)}>
          Show 16 more weeks
        </button>
      </div>
    </div>
  );
}

function WeekCard({ state, w, today, filt, nav, who }: { state: State; w: WeekRow; today: string; filt: (o: Occ) => boolean; nav: Nav; who: Who }) {
  const isNow = today >= w.start && today <= w.end;
  const occs = w.occs.filter(filt);
  const accounts = live(state.accounts).filter((a) => who === 'all' || a.owner === who);
  const out = occs.filter((o) => o.gbp < 0).reduce((s, o) => s - o.gbp, 0);
  const inn = occs.filter((o) => o.gbp > 0).reduce((s, o) => s + o.gbp, 0);
  const byDay: [string, Occ[]][] = [];
  for (const o of occs) {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === o.date) last[1].push(o);
    else byDay.push([o.date, [o]]);
  }
  return (
    <section class={`card tight week ${mClass(w)} ${isNow ? 'now' : ''}`} aria-label={`Week ${weekLabel(w.start)}`}>
      <div class="w-head">
        <div>
          <div class="w-title">{weekLabel(w.start)}</div>
          <div class="muted small">
            {isNow ? 'This week · ' : w.end < today ? 'Past · ' : ''}
            {occs.length} payments
          </div>
        </div>
        <div style={{ textAlign: 'right' }} class="small">
          {inn > 0 && <div class="pos">+{money(inn)} in</div>}
          <div>−{money(out)} out</div>
        </div>
      </div>
      {byDay.map(([d, list]) => (
        <>
          <div class={`daylabel`} style={d === today ? { color: 'var(--ink)' } : undefined}>
            {nice(d)}
            {d === today ? ' · today' : ''}
          </div>
          {list.map((o) => (
            <OccRow state={state} o={o} today={today} onOpen={nav.openOcc} showDate={false} />
          ))}
        </>
      ))}
      {!occs.length && <div class="empty" style={{ padding: '18px' }}>Nothing this week.</div>}
      <div class="w-bal">
        {accounts.map((a) => (
          <span>
            <span class={`pdot ${state.people[a.owner]?.tone || ''}`} /> {a.name} at the end:{' '}
            <b class={w.close[a.id] < 0 ? 'neg' : ''}>{money(w.close[a.id])}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

function SheetGrid({ state, rows, today, who, nav }: { state: State; rows: WeekRow[]; today: string; who: Who; nav: Nav }) {
  const items = live(state.items)
    .filter((i) => i.schedule.kind !== 'none' && (who === 'all' || i.person === who))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || (a.person < b.person ? -1 : a.person > b.person ? 1 : 0) || a.name.localeCompare(b.name));
  // only rows that have something in the weeks shown
  const cells = new Map<string, Occ[]>();
  for (const w of rows) for (const o of w.occs) {
    const k = `${o.item.id}|${w.start}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(o);
  }
  const shown = items.filter((i) => rows.some((w) => cells.has(`${i.id}|${w.start}`)));
  const accounts = live(state.accounts).filter((a) => who === 'all' || a.owner === who);
  const groups: [string, Item[]][] = [];
  for (const i of shown) {
    const last = groups[groups.length - 1];
    if (last && last[0] === i.group) last[1].push(i);
    else groups.push([i.group, [i]]);
  }
  const isNow = (w: WeekRow) => today >= w.start && today <= w.end;
  // each column wears its month's colour; a dark line where a new month starts
  const col = (w: WeekRow, i: number) => `${mClass(w)}${i > 0 && monthOf(rows[i - 1]) !== monthOf(w) ? ' mstart' : ''}${isNow(w) ? ' now' : ''}`;
  const bands: { ym: string; n: number; w: WeekRow; i: number }[] = [];
  rows.forEach((w, i) => {
    const last = bands[bands.length - 1];
    if (last && last.ym === monthOf(w)) last.n++;
    else bands.push({ ym: monthOf(w), n: 1, w, i });
  });
  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '' : money(v, 'GBP', { exact: Math.abs(v) < 100 }));
  return (
    <div class="gridwrap">
      <table class="grid">
        <thead>
          <tr class="mrow">
            <th class="rowhead" />
            {bands.map((b) => (
              <th colSpan={b.n} class={col(b.w, b.i).replace(' now', '')}>
                {monthTitle(b.ym)}
              </th>
            ))}
          </tr>
          <tr class="wrow">
            <th class="rowhead">Payment</th>
            {rows.map((w, i) => (
              <th class={col(w, i)}>{weekLabel(w.start)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr class="total">
              <td class="rowhead">
                <span class={`pdot ${state.people[a.owner]?.tone || ''}`} /> {a.name} — start of week
              </td>
              {rows.map((w, i) => (
                <td class={`cell ${col(w, i)}`}>{money(w.open[a.id])}</td>
              ))}
            </tr>
          ))}
          {groups.map(([g, list]) => (
            <>
              <tr class="grp">
                <td class="rowhead">{g}</td>
                {rows.map((w, i) => (
                  <td class={`gcell ${col(w, i)}`} />
                ))}
              </tr>
              {list.map((i) => (
                <tr>
                  <td class="rowhead" title={i.name}>
                    <button style={{ border: '0px', background: 'none', padding: '0px', font: 'inherit', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }} onClick={() => nav.openItem(i.id)}>
                      <span class={`pdot ${state.people[i.person]?.tone || ''}`} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name}</span>
                      {i.currency === 'ZAR' && <span class="tag">R</span>}
                    </button>
                  </td>
                  {rows.map((w, ci) => {
                    const list2 = cells.get(`${i.id}|${w.start}`) || [];
                    const sum = list2.reduce((s, o) => s + o.gbp, 0);
                    const paid = list2.length > 0 && list2.every((o) => o.paid || o.item.kind === 'budget');
                    const changed = list2.some((o) => o.changed || o.moved);
                    return (
                      <td class={`cell ${col(w, ci)} ${paid && list2.some((o) => o.paid) ? 'paid' : ''} ${changed ? 'changed' : ''}`}>
                        {list2.length > 0 && (
                          <button onClick={() => nav.openOcc(list2[0].key)} title={list2.map((o) => `${nice(o.date)} ${money(o.amount, o.item.currency)}${o.paid ? ' · paid' : ''}`).join('\n')}>
                            <span class={sum > 0 ? 'pos' : ''}>{fmt(sum)}</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
          {live(state.people)
            .filter((p) => who === 'all' || p.id === who)
            .map((p) => (
              <tr class="total">
                <td class="rowhead">
                  <span class={`pdot ${p.tone}`} /> {p.name} — out this week
                </td>
                {rows.map((w, i) => (
                  <td class={`cell ${col(w, i)}`}>{fmt(-(w.outGBP[p.id] || 0))}</td>
                ))}
              </tr>
            ))}
          {accounts.map((a) => (
            <tr class="total">
              <td class="rowhead">
                <span class={`pdot ${state.people[a.owner]?.tone || ''}`} /> {a.name} — end of week
              </td>
              {rows.map((w, i) => (
                <td class={`cell ${col(w, i)} ${w.close[a.id] < 0 ? 'neg' : ''}`}>{money(w.close[a.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
