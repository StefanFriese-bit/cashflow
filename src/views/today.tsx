import { useEffect, useState } from 'preact/hooks';
import { addDays, addMonths, diffDays, monthEnd, monthName, nice, short, ymd } from '../engine/dates';
import { money, round2 } from '../engine/money';
import { balanceAt, dailyBalances, dueSoon, goalStatus, latestBalance, loanStatus, lowestPoint, notTicked, occurrences, toGBP } from '../engine/plan';
import type { State } from '../engine/types';
import { live } from '../engine/types';
import { me, newId, saveBalance, saveSettings } from '../store';
import { Banner, Field, Icon, MoneyInput, Sheet } from '../ui';
import { BalanceChart } from './chart';
import { OccRow } from './rows';
import type { Nav } from '../app';

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function useLiveRate(): { rate: number; date: string } | null {
  const [r, setR] = useState<{ rate: number; date: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('cashflow-live-rate') || 'null');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const fresh = r && Date.now() - (r as any).at < 6 * 3600e3;
    if (fresh) return;
    fetch('https://api.frankfurter.dev/v2/rates?base=GBP&quotes=ZAR')
      .then((x) => x.json())
      .then((j) => {
        const row = Array.isArray(j) ? j[0] : null;
        if (row?.rate) {
          const v = { rate: row.rate, date: row.date, at: Date.now() };
          setR(v);
          try {
            localStorage.setItem('cashflow-live-rate', JSON.stringify(v));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, []);
  return r;
}

export function Today({ state, today, nav }: { state: State; today: string; nav: Nav }) {
  const [balSheet, setBalSheet] = useState(false);
  const accounts = live(state.accounts);
  const people = state.people;
  const meId = me();
  const name = meId ? people[meId]?.name : '';
  const [y, m, d] = ymd(today);
  const weekdayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));

  const soon = occurrences(state, today, addDays(today, 6));
  const due = dueSoon(state, today, state.settings.remindDays, false);
  const late = notTicked(state, today);
  const unconfirmed = live(state.items).filter((i) => !i.dayConfirmed && i.schedule.kind !== 'none');
  const horizon = addDays(addMonths(today, 6), 0);
  const series = accounts.map((a) => ({ id: a.id, name: a.name, tone: people[a.owner]?.tone || ('' as const), points: dailyBalances(state, a.id, today, horizon) }));
  const oldestCheck = accounts.map((a) => latestBalance(state, a.id, today)).filter(Boolean).sort((a, b) => (a!.date < b!.date ? -1 : 1))[0];
  const placeholder = accounts.some((a) => latestBalance(state, a.id, today)?.id.endsWith('-start'));
  const stale = !oldestCheck || placeholder || diffDays(today, oldestCheck.date) > 10;

  const loans = live(state.loans).map((l) => loanStatus(state, l.id, today));
  const debtLeft = loans.reduce((s, l) => s + l.remaining, 0);
  const debtFree = loans.every((l) => l.remaining <= 0.5 || l.clearOn) ? loans.map((l) => l.clearOn || '').sort().pop() : undefined;
  const goals = live(state.goals).map((g) => goalStatus(state, g.id, today));
  const live_ = useLiveRate();

  if (!accounts.length) return <Welcome nav={nav} />;

  return (
    <div class="reveal">
      <div class="head">
        <div>
          <div class="eyebrow" style={{ marginTop: '8px' }}>
            {weekdayLong} {d} {monthName(m, true)}
          </div>
          <h1 class="title">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
        <button class="iconbtn" aria-label="Settings" onClick={() => nav.go('settings')}>
          <Icon name="settings" />
        </button>
      </div>
      <div style={{ height: '10px' }} />

      <div>
        {stale && (
          <Banner kind="warn" icon="alert" action={<button class="btn small" onClick={() => setBalSheet(true)}>Update</button>}>
            <b>Check your bank balances.</b> {placeholder ? 'The app starts from the sheet’s £1,000 starting figures.' : oldestCheck ? `Last entered ${short(oldestCheck.date)}.` : 'None entered yet.'} Enter today’s figures so the forecast is exact.
          </Banner>
        )}
        {unconfirmed.length > 0 && (
          <Banner kind="info" icon="calendarQ" action={<button class="btn small" onClick={() => nav.go('payments', { filter: 'unconfirmed' })}>Check</button>}>
            <b>{unconfirmed.length} payments need their day checked</b> — the sheet only showed the week they fall in.
          </Banner>
        )}
      </div>

      <div class="hero">
        {accounts.map((a) => {
          const p = people[a.owner];
          const now = balanceAt(state, a.id, today);
          const eom = balanceAt(state, a.id, monthEnd(today));
          const low = lowestPoint(state, a.id, today, addDays(today, 90));
          return (
            <button class={`acct ${p?.tone || ''}`} style={{ textAlign: 'left' }} onClick={() => setBalSheet(true)} aria-label={`${a.name}: ${money(now)} today. Tap to enter the real balance.`}>
              <div class="label">
                {a.name} <span class="muted">· {p?.name}</span>
              </div>
              <div class={`big num ${now < 0 ? 'neg' : ''}`}>{money(now)}</div>
              <div class="row">
                <span>End of {monthName(m)}</span>
                <b class={eom < 0 ? 'neg' : ''}>{money(eom)}</b>
              </div>
              <div class="row">
                <span>Lowest ahead</span>
                <b style={low.bal < 250 ? { color: low.bal < 0 ? 'var(--bad)' : 'var(--warn)' } : undefined}>{money(low.bal)}</b>
              </div>
              <div class="row">
                <span />
                <span class="muted">{nice(low.date)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div class="cols">
        <div>
          {late.length > 0 && (
            <>
              <h2 class="section">
                Not ticked off yet <small>{late.length}</small>
              </h2>
              <div class="card tight">
                {late.slice(-6).map((o) => (
                  <OccRow state={state} o={o} today={today} onOpen={nav.openOcc} showRelative />
                ))}
                {late.length > 6 && (
                  <button class="li" onClick={() => nav.go('weeks')}>
                    <span class="grow muted">{late.length - 6} more in Weeks</span>
                    <Icon name="chevron" class="muted" />
                  </button>
                )}
              </div>
            </>
          )}

          <h2 class="section">
            Next 7 days
            <small>
              {due.length ? `${due.length} due in the next ${state.settings.remindDays} days` : 'nothing due in the next 2 days'}
            </small>
          </h2>
          <div class="card tight">
            {soon.length ? (
              soon.map((o) => <OccRow state={state} o={o} today={today} onOpen={nav.openOcc} showRelative />)
            ) : (
              <div class="empty">Nothing planned this week.</div>
            )}
          </div>
        </div>

        <div>
          <h2 class="section">
            The next six months <small>end-of-day balance</small>
          </h2>
          <div class="card">
            <BalanceChart series={series} today={today} />
            <div class="legend" style={{ marginTop: '8px' }}>
              {series.map((s) => (
                <span>
                  <i style={{ background: `var(--${s.tone || 'ink-2'})` }} />
                  {s.name}
                </span>
              ))}
              <span class="muted">Touch the chart to read a day</span>
            </div>
          </div>

          {loans.length > 0 && (
            <button class="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => nav.go('loans')}>
              <div class="eyebrow">Loans in South Africa</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '4px 0 6px' }}>
                <span class="num" style={{ fontSize: '26px', fontWeight: 560 }}>{money(debtLeft, 'ZAR')}</span>
                <span class="muted small">left · ≈ {money(toGBP(debtLeft, 'ZAR', state.settings.rate))}</span>
              </div>
              {debtLeft <= 0.5 ? (
                <span class="stamp">
                  <Icon name="check" class="" /> Debt free
                </span>
              ) : debtFree ? (
                <div class="small">
                  All paid off on <b>{nice(debtFree, true)}</b> if the plan holds — {diffDays(debtFree, today)} days.
                </div>
              ) : (
                <div class="small">Not every loan has repayments planned yet.</div>
              )}
            </button>
          )}

          {goals.map((g) => {
            const pct = Math.min(100, (g.saved / g.goal.target) * 100);
            const pct2 = Math.min(100 - pct, (g.planned / g.goal.target) * 100);
            return (
              <button class="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => nav.go('loans')}>
                <div class="eyebrow">Saving for · {g.goal.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '4px 0 8px' }}>
                  <span class="num" style={{ fontSize: '26px', fontWeight: 560 }}>{money(g.saved, g.goal.currency)}</span>
                  <span class="muted small">of {money(g.goal.target, g.goal.currency)}</span>
                </div>
                <div class="progress" aria-hidden="true">
                  <i style={{ width: `${pct}%`, background: 'var(--good)' }} />
                  <i style={{ width: `${pct2}%`, background: 'color-mix(in srgb, var(--good) 30%, transparent)' }} />
                </div>
                <div class="small" style={{ marginTop: '8px' }}>
                  {g.short > 0.5 ? (
                    <>Planned savings reach {money(g.projected, g.goal.currency)} — <b>{money(g.short, g.goal.currency)} short</b>{g.goal.by ? ` by ${short(g.goal.by)}` : ''}.</>
                  ) : (
                    <>On track{g.goal.by ? ` for ${short(g.goal.by)}` : ''}.</>
                  )}
                </div>
              </button>
            );
          })}

          <div class="card">
            <div class="eyebrow">Rand to the pound</div>
            <div class="kv">
              <span>Used in the plan</span>
              <b class="num">R{state.settings.rate}</b>
            </div>
            {live_ && (
              <>
                <div class="kv">
                  <span>Today’s rate ({short(live_.date, false)})</span>
                  <b class="num">R{live_.rate.toFixed(2)}</b>
                </div>
                <RateEffect state={state} today={today} live={live_.rate} />
                {Math.abs(live_.rate - state.settings.rate) >= 0.05 && (
                  <button class="btn small" style={{ marginTop: '6px' }} onClick={() => saveSettings({ rate: round2(live_.rate) })}>
                    Use R{live_.rate.toFixed(2)} in the plan
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {balSheet && <BalanceSheet state={state} today={today} onClose={() => setBalSheet(false)} />}
    </div>
  );
}

function RateEffect({ state, today, live }: { state: State; today: string; live: number }) {
  const occs = occurrences(state, today, addDays(today, 89)).filter((o) => o.item.currency === 'ZAR' && o.item.kind !== 'income' && !o.paid);
  const rand = occs.reduce((s, o) => s + o.amount, 0);
  if (!rand) return null;
  const diff = rand / state.settings.rate - rand / live;
  return (
    <p class="small muted" style={{ margin: '4px 0 0' }}>
      Rand payments in the next 3 months: {money(rand, 'ZAR')}. At today’s rate they cost {money(Math.abs(diff))} {diff >= 0 ? 'less' : 'more'} than planned.
    </p>
  );
}

export function BalanceSheet({ state, today, onClose }: { state: State; today: string; onClose: () => void }) {
  const accounts = live(state.accounts);
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const [date, setDate] = useState(today);
  const history = live(state.balances).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Sheet title="Bank balances" onClose={onClose}>
      <p class="muted small" style={{ marginTop: '0px' }}>
        Type what the banking app shows. The forecast starts again from these figures — nothing else changes.
      </p>
      <Field label="As at the start of">
        <input class="input" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </Field>
      {accounts.map((a) => (
        <Field group label={`${a.name} (${state.people[a.owner]?.name})`} hint={`The app expected ${money(balanceAt(state, a.id, addDays(date, -1)))} at the start of ${short(date, false)}.`}>
          <MoneyInput value={vals[a.id] ?? null} currency="GBP" onValue={(v) => setVals((x) => ({ ...x, [a.id]: v }))} label={`${a.name} balance`} />
        </Field>
      ))}
      <button
        class="btn primary block"
        disabled={!Object.values(vals).some((v) => v !== null && v !== undefined) || !date}
        onClick={() => {
          for (const a of accounts) {
            const v = vals[a.id];
            if (v === null || v === undefined) continue;
            saveBalance({ id: newId('b'), account: a.id, date, amount: round2(v), u: 0 });
          }
          onClose();
        }}
      >
        Save
      </button>
      <h2 class="section">Entered before</h2>
      <div class="card tight">
        {history.map((b) => (
          <div class="li">
            <span class="grow">
              <div class="name">{state.accounts[b.account]?.name}</div>
              <div class="meta">{nice(b.date, true)}</div>
            </span>
            <span class="amt">{money(b.amount)}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Welcome({ nav }: { nav: Nav }) {
  return (
    <div class="empty" style={{ paddingTop: '60px' }}>
      <h1 class="title">Cash flow</h1>
      <p>Your household plan lives in your private store. Connect this device to load it.</p>
      <button class="btn primary" onClick={() => nav.go('settings')}>
        Connect
      </button>
    </div>
  );
}
