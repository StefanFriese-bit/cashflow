import { useState } from 'preact/hooks';
import { addDays, nice, ordinal, short, todayUK, monthName, weekday, dayName } from '../engine/dates';
import { money, round2 } from '../engine/money';
import { amountAt, occurrences, scheduleText, scheduleEndText, toGBP, nextOccurrence } from '../engine/plan';
import type { Currency, Item, ItemKind, Occ, Schedule, State } from '../engine/types';
import { live } from '../engine/types';
import { changeOne, deleteItem, markPaid, me, newId, saveItem, unmarkPaid } from '../store';
import { Banner, Field, Icon, MoneyInput, Seg, Sheet, Switch, Who } from '../ui';

export const KIND_LABEL: Record<ItemKind, string> = { income: 'Money in', bill: 'Payment', saving: 'Saving', budget: 'Spending budget' };

export function findOcc(state: State, key: string): Occ | undefined {
  const [, orig] = key.split('|');
  return occurrences(state, addDays(orig, -150), addDays(orig, 150), { includeSkipped: true }).find((o) => o.key === key);
}

// ======================= one payment =======================

export function OccSheet({ state, occKey, onClose, onEditItem }: { state: State; occKey: string; onClose: () => void; onEditItem: (id: string) => void }) {
  const occ = findOcc(state, occKey);
  const today = todayUK();
  const [mode, setMode] = useState<'' | 'paid' | 'move' | 'amount'>('');
  const ov = state.overrides[occKey];
  const skipped = !!(ov && !ov.del && ov.skip);
  const item = occ?.item ?? state.items[occKey.split('|')[0]];
  const [amt, setAmt] = useState<number | null>(occ?.amount ?? null);
  const [date, setDate] = useState<string>(occ ? (occ.paid ? occ.paid.on : occ.date <= today ? occ.date : today) : today);
  const [moveTo, setMoveTo] = useState<string>(occ?.date ?? today);
  if (!item) return null;
  const orig = occKey.split('|')[1];
  const cur = item.currency;
  const rate = state.settings.rate;
  const planned = amountAt(item, orig);
  const fake: Pick<Occ, 'key' | 'item' | 'orig'> = { key: occKey, item, orig };
  const isBudget = item.kind === 'budget';
  const shown = occ?.amount ?? planned;
  const shownDate = occ?.date ?? ov?.moveTo ?? orig;

  return (
    <Sheet title={item.name} onClose={onClose}>
      <div class="row-btns" style={{ marginBottom: '12px', alignItems: 'center' }}>
        <Who state={state} person={item.person} />
        <span class="tag">{KIND_LABEL[item.kind]}</span>
        <span class="tag">{item.group}</span>
        {!item.dayConfirmed && <span class="tag warn">Day not confirmed</span>}
      </div>

      <div class="card flat" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ flex: 1 }}>
          <div class="eyebrow">{occ?.paid ? 'Paid' : skipped ? 'Skipped' : item.kind === 'income' ? 'Expected' : 'Due'}</div>
          <div class="num" style={{ fontSize: '30px', fontWeight: 560, textDecoration: skipped ? 'line-through' : undefined }}>
            {money(shown, cur)}
          </div>
          {cur === 'ZAR' && <div class="muted small">≈ {money(toGBP(shown, cur, rate))} at R{rate}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 650 }}>{nice(shownDate, true)}</div>
          {shownDate !== orig && <div class="muted small">planned {short(orig, false)}</div>}
          {occ?.changed && !occ.paid && <div class="muted small">planned {money(planned, cur)}</div>}
        </div>
      </div>

      {occ?.paid && (
        <Banner kind="info" icon="check">
          Ticked off as paid on <b>{nice(occ.paid.on)}</b>, {money(occ.paid.amount, cur)}
          {occ.paid.by && state.people[occ.paid.by] ? ` — by ${state.people[occ.paid.by].name}` : ''}.
        </Banner>
      )}

      {!occ?.paid && !skipped && !isBudget && mode !== 'paid' && (
        <button class="btn good block" style={{ marginBottom: '10px' }} onClick={() => { markPaid(occ!, shown, occ!.date <= today ? occ!.date : today); onClose(); }} disabled={!occ}>
          <Icon name="check" /> {item.kind === 'income' ? 'It came in' : 'Paid'} — {money(shown, cur)}
        </button>
      )}

      {mode === 'paid' && occ && (
        <div class="card flat">
          <Field group label="Amount that went out">
            <MoneyInput value={amt} currency={cur} onValue={setAmt} autoFocus />
          </Field>
          <Field label="On">
            <input class="input" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </Field>
          <div class="row-btns">
            <button class="btn good" disabled={amt === null || !date} onClick={() => { markPaid(occ, round2(amt!), date); onClose(); }}>
              <Icon name="check" /> Save as paid
            </button>
            <button class="btn ghost" onClick={() => setMode('')}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div class="card flat">
          <Field label="Move this one payment to" hint="Only this date moves. To change the day for every month, edit the whole payment.">
            <input class="input" type="date" value={moveTo} onInput={(e) => setMoveTo((e.target as HTMLInputElement).value)} />
          </Field>
          <div class="row-btns">
            <button class="btn primary" disabled={!moveTo} onClick={() => { changeOne(fake, { moveTo: moveTo === orig ? undefined : moveTo }); setMode(''); }}>
              Move
            </button>
            <button class="btn ghost" onClick={() => setMode('')}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'amount' && (
        <div class="card flat">
          <Field group label="Amount this time" hint={`Planned: ${money(planned, cur)}. Only this one changes.`}>
            <MoneyInput value={amt} currency={cur} onValue={setAmt} autoFocus />
          </Field>
          <div class="row-btns">
            <button class="btn primary" disabled={amt === null} onClick={() => { changeOne(fake, { amount: Math.abs(amt! - planned) < 0.005 ? undefined : round2(amt!) }); setMode(''); }}>
              Save
            </button>
            <button class="btn ghost" onClick={() => setMode('')}>Cancel</button>
          </div>
        </div>
      )}

      {mode === '' && (
        <div class="card tight">
          {occ?.paid ? (
            <button class="li" onClick={() => unmarkPaid(occ)}>
              <Icon name="undo" class="muted" />
              <span class="grow">Not paid after all</span>
            </button>
          ) : (
            !isBudget &&
            !skipped && (
              <button class="li" onClick={() => setMode('paid')}>
                <Icon name="check" class="muted" />
                <span class="grow">Paid, but a different amount or date</span>
              </button>
            )
          )}
          {!occ?.paid && (
            <button class="li" onClick={() => { setMoveTo(shownDate); setMode('move'); }}>
              <Icon name="move" class="muted" />
              <span class="grow">Move this one to another date</span>
            </button>
          )}
          {!occ?.paid && (
            <button class="li" onClick={() => { setAmt(shown); setMode('amount'); }}>
              <Icon name="edit" class="muted" />
              <span class="grow">Change the amount this time</span>
            </button>
          )}
          {!occ?.paid && (
            <button class="li" onClick={() => changeOne(fake, { skip: !skipped || undefined })}>
              <Icon name={skipped ? 'undo' : 'skip'} class="muted" />
              <span class="grow">{skipped ? 'Bring this one back' : 'Skip this one'}</span>
            </button>
          )}
          {ov && !ov.del && !ov.paid && (ov.moveTo || ov.amount !== undefined || ov.skip) && (
            <button class="li" onClick={() => changeOne(fake, { moveTo: undefined, amount: undefined, skip: undefined })}>
              <Icon name="undo" class="muted" />
              <span class="grow">Back to the plan</span>
            </button>
          )}
          <button class="li" onClick={() => onEditItem(item.id)}>
            <Icon name="calendarQ" class="muted" />
            <span class="grow">
              Edit the whole payment
              <div class="meta">{scheduleText(item.schedule)} · change the date for every month here</div>
            </span>
            <Icon name="chevron" class="muted" />
          </button>
        </div>
      )}
      {item.note && <p class="muted small" style={{ marginTop: '6px' }}>{item.note}</p>}
    </Sheet>
  );
}

// ======================= whole payment =======================

export function newItem(state: State, person: string): Item {
  const acct = live(state.accounts).find((a) => a.owner === person) || live(state.accounts)[0];
  return {
    id: newId('i'),
    u: 0,
    name: '',
    person,
    account: acct?.id || '',
    currency: 'GBP',
    kind: 'bill',
    group: 'Living',
    amount: 0,
    schedule: { kind: 'monthly', days: [1], start: todayUK().slice(0, 8) + '01' },
    dayConfirmed: true,
    remind: true,
  };
}

export function ItemEditor({ state, item: initial, onClose }: { state: State; item: Item; onClose: () => void }) {
  const [it, setIt] = useState<Item>(() => JSON.parse(JSON.stringify(initial)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !state.items[initial.id] || state.items[initial.id].del;
  const today = todayUK();
  const people = live(state.people);
  const accounts = live(state.accounts);
  const groups = [...new Set([...live(state.items).map((i) => i.group), 'Income', 'House', 'Cars', 'Living', 'Subscriptions', 'Savings', 'SA payments', 'Tax'])].sort();
  const [newGroup, setNewGroup] = useState('');

  const set = (p: Partial<Item>) => setIt((x) => ({ ...x, ...p }));
  const setSched = (s: Schedule, touchedDay = true) => set({ schedule: s, ...(touchedDay ? { dayConfirmed: true } : {}) });
  const s = it.schedule;
  const next = nextOccurrence(state, it, today);

  const switchKind = (k: Schedule['kind']) => {
    const start = s.kind === 'monthly' || s.kind === 'weekly' ? s.start : today;
    if (k === 'monthly') setSched({ kind: 'monthly', days: s.kind === 'monthly' ? s.days : [Number(start.slice(8))], start: start.slice(0, 8) + '01' });
    else if (k === 'weekly') setSched({ kind: 'weekly', every: 1, start });
    else if (k === 'once') setSched({ kind: 'once', dates: s.kind === 'once' ? s.dates : [next?.date || today] });
    else setSched({ kind: 'none' });
  };

  const valid = it.name.trim() && (it.amount > 0 || s.kind === 'none') && (s.kind !== 'monthly' || s.days.length > 0) && (s.kind !== 'once' || s.dates.every(Boolean));
  const save = () => {
    const group = newGroup.trim() || it.group;
    saveItem({ ...it, name: it.name.trim(), group, steps: (it.steps || []).filter((x) => x.from && x.amount > 0) });
    onClose();
  };

  return (
    <Sheet title={isNew ? 'New payment' : 'Edit payment'} onClose={onClose}>
      {!it.dayConfirmed && s.kind !== 'none' && (
        <Banner kind="warn" icon="calendarQ">
          <b>Day not confirmed.</b> Your sheet only showed the week, so this date is a best guess. Pick the right day below — or switch on “I’ve checked the date” if it is already right.
        </Banner>
      )}
      <Field label="Name">
        <input class="input" value={it.name} placeholder="e.g. Car insurance" onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
      </Field>

      <Field group label="What it is">
        <Seg<ItemKind>
          full
          value={it.kind}
          onChange={(k) => set({ kind: k, remind: k === 'bill' || k === 'saving', dayConfirmed: k === 'budget' ? true : it.dayConfirmed })}
          options={(['bill', 'income', 'saving', 'budget'] as ItemKind[]).map((k) => ({ v: k, label: k === 'budget' ? 'Budget' : KIND_LABEL[k] }))}
        />
        <div class="hint">
          {it.kind === 'budget'
            ? 'Spending money (food, petrol): counted in the plan, never needs ticking off, no reminders.'
            : it.kind === 'income'
              ? 'Money that comes in — salary, a refund.'
              : it.kind === 'saving'
                ? 'Money you put aside. Can count towards a goal.'
                : 'A payment that goes out on a date — debit order, rent, a transfer you make.'}
        </div>
      </Field>

      <div class="grid2">
        <Field group label={it.kind === 'income' ? 'Whose money' : 'Who pays'}>
          <Seg
            full
            value={it.person}
            onChange={(p) => set({ person: p, account: accounts.find((a) => a.owner === p)?.id || it.account })}
            options={people.map((p) => ({ v: p.id, label: <><span class={`pdot ${p.tone}`} />{p.name}</> }))}
          />
        </Field>
        <Field label="Account">
          <select class="input" value={it.account} onChange={(e) => set({ account: (e.target as HTMLSelectElement).value })}>
            {accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field group label="Amount" hint={it.currency === 'ZAR' ? `Rand — counted at R${state.settings.rate} to the pound (≈ ${money(toGBP(it.amount, 'ZAR', state.settings.rate))}). Tap R to switch to pounds.` : 'Tap £ to switch to rand.'}>
        <MoneyInput value={it.amount} currency={it.currency} onValue={(v) => set({ amount: v ?? 0 })} onCurrency={(c: Currency) => set({ currency: c })} />
      </Field>

      <h2 class="section" style={{ marginTop: '6px' }}>When</h2>
      <div style={{ marginBottom: '12px' }}>
        <Seg<Schedule['kind']>
          full
          value={s.kind}
          onChange={switchKind}
          options={[
            { v: 'monthly', label: 'Monthly' },
            { v: 'weekly', label: 'Weekly' },
            { v: 'once', label: 'Once' },
            { v: 'none', label: 'No date' },
          ]}
        />
      </div>

      {s.kind === 'monthly' && (
        <>
          <Field group label="On which day of the month" hint="Pick more than one if it goes out several times a month. “Last day” is the 28th–31st.">
            <div class="daygrid" role="group" aria-label="Days of the month">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                <button type="button" class={s.days.includes(d) ? 'on' : ''} aria-pressed={s.days.includes(d)} onClick={() => setSched({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort((a, b) => a - b) })}>
                  {d}
                </button>
              ))}
              <button type="button" class={`wide ${s.days.includes(31) ? 'on' : ''}`} aria-pressed={s.days.includes(31)} onClick={() => setSched({ ...s, days: s.days.includes(31) ? s.days.filter((x) => x !== 31) : [...s.days, 31] })}>
                Last day
              </button>
            </div>
          </Field>
          <Field group label="Months it does NOT go out" hint="Tap a month to leave it out (e.g. no council tax in February and March).">
            <div class="monthgrid">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const off = (s.skipMonths || []).includes(m);
                return (
                  <button type="button" class={off ? 'off' : ''} aria-pressed={off} onClick={() => setSched({ ...s, skipMonths: off ? (s.skipMonths || []).filter((x) => x !== m) : [...(s.skipMonths || []), m].sort((a, b) => a - b) }, false)}>
                    {monthName(m)}
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      )}

      {s.kind === 'weekly' && (
        <>
          <Field group label="How often">
            <Seg
              full
              value={String(s.every)}
              onChange={(v) => setSched({ ...s, every: Number(v) })}
              options={['1', '2', '3', '4'].map((v) => ({ v, label: v === '1' ? 'Every week' : `Every ${v}` }))}
            />
          </Field>
          <Field label="First one on" hint={`Goes out on a ${dayName(s.start)}.`}>
            <input class="input" type="date" value={s.start} onInput={(e) => setSched({ ...s, start: (e.target as HTMLInputElement).value || s.start })} />
          </Field>
        </>
      )}

      {s.kind === 'once' && (
        <Field group label="Date(s)" hint="A one-off, or a few fixed dates.">
          {s.dates.map((d, i) => (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input class="input" type="date" value={d} onInput={(e) => setSched({ ...s, dates: s.dates.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)) })} />
              {s.dates.length > 1 && (
                <button type="button" class="iconbtn" aria-label="Remove date" onClick={() => setSched({ ...s, dates: s.dates.filter((_, j) => j !== i) })}>
                  <Icon name="close" />
                </button>
              )}
            </div>
          ))}
          <button type="button" class="btn small" onClick={() => setSched({ ...s, dates: [...s.dates, addDays(s.dates[s.dates.length - 1] || today, 30)] })}>
            <Icon name="plus" /> Another date
          </button>
        </Field>
      )}

      {(s.kind === 'monthly' || s.kind === 'weekly') && (
        <div class="grid2 stack-sm">
          {s.kind === 'monthly' && (
            <Field label="Starting from">
              <input class="input" type="date" value={s.start} onInput={(e) => setSched({ ...s, start: (e.target as HTMLInputElement).value || s.start }, false)} />
            </Field>
          )}
          <Field label="Ends">
            <select
              class="input"
              value={s.count ? 'count' : s.end ? 'end' : 'never'}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const { count, end, ...rest } = s as any;
                setSched(v === 'count' ? { ...rest, count: count || 12 } : v === 'end' ? { ...rest, end: end || addDays(today, 365) } : rest, false);
              }}
            >
              <option value="never">Never</option>
              <option value="count">After a number of payments</option>
              <option value="end">On a date</option>
            </select>
          </Field>
          {s.count !== undefined && s.count > 0 && (
            <Field label="Number of payments">
              <input class="input" type="number" inputMode="numeric" min="1" value={s.count} onInput={(e) => setSched({ ...s, count: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }, false)} />
            </Field>
          )}
          {s.end && (
            <Field label="Last one on or before">
              <input class="input" type="date" value={s.end} onInput={(e) => setSched({ ...s, end: (e.target as HTMLInputElement).value || s.end }, false)} />
            </Field>
          )}
        </div>
      )}

      {s.kind !== 'none' && it.kind !== 'budget' && (
        <Switch label="I’ve checked the date" sub={it.dayConfirmed ? 'This is the right day.' : 'Shown as “day not confirmed” until you switch this on.'} checked={it.dayConfirmed} onChange={(v) => set({ dayConfirmed: v })} />
      )}

      <p class="muted small" style={{ margin: '4px 0 0' }}>
        {scheduleText(s)}
        {scheduleEndText(s) ? ` · ${scheduleEndText(s)}` : ''}
        {next ? ` · next: ${nice(next.date)}` : ''}
      </p>

      <h2 class="section">Amount changes</h2>
      <p class="muted small" style={{ marginTop: '-4px' }}>For a known change from a date — a pay rise, a new price.</p>
      {(it.steps || []).map((st, i) => (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
          <span class="small muted" style={{ width: '38px' }}>From</span>
          <input class="input" type="date" style={{ flex: 1 }} value={st.from} onInput={(e) => set({ steps: it.steps!.map((x, j) => (j === i ? { ...x, from: (e.target as HTMLInputElement).value } : x)) })} />
          <div style={{ flex: 1 }}>
            <MoneyInput value={st.amount} currency={it.currency} onValue={(v) => set({ steps: it.steps!.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)) })} />
          </div>
          <button type="button" class="iconbtn" aria-label="Remove change" onClick={() => set({ steps: it.steps!.filter((_, j) => j !== i) })}>
            <Icon name="close" />
          </button>
        </div>
      ))}
      <button type="button" class="btn small" onClick={() => set({ steps: [...(it.steps || []), { from: addDays(today, 30), amount: it.amount }] })}>
        <Icon name="plus" /> Add a change
      </button>

      <h2 class="section">More</h2>
      {it.kind !== 'budget' && it.kind !== 'income' && (
        <Switch label="Remind us" sub={`A notification ${state.settings.remindDays} days before, and the pop-up when the app opens.`} checked={it.remind} onChange={(v) => set({ remind: v })} />
      )}
      <Field label="Section">
        <select class="input" value={newGroup ? '__new' : it.group} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v === '__new') setNewGroup('New section');
          else {
            setNewGroup('');
            set({ group: v });
          }
        }}>
          {groups.map((g) => (
            <option value={g}>{g}</option>
          ))}
          <option value="__new">New section…</option>
        </select>
        {newGroup && <input class="input" style={{ marginTop: '8px' }} value={newGroup} onInput={(e) => setNewGroup((e.target as HTMLInputElement).value)} />}
      </Field>
      {live(state.loans).length > 0 && it.kind === 'bill' && (
        <Field label="Pays off a loan" hint="Ticking it off as paid then also records the repayment on that loan.">
          <select class="input" value={it.loan || ''} onChange={(e) => set({ loan: (e.target as HTMLSelectElement).value || undefined })}>
            <option value="">No</option>
            {live(state.loans).map((l) => (
              <option value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
      )}
      {live(state.goals).length > 0 && it.kind === 'saving' && (
        <Field label="Saves towards">
          <select class="input" value={it.goal || ''} onChange={(e) => set({ goal: (e.target as HTMLSelectElement).value || undefined })}>
            <option value="">Nothing in particular</option>
            {live(state.goals).map((g) => (
              <option value={g.id}>{g.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Note">
        <textarea class="input" value={it.note || ''} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value || undefined })} />
      </Field>

      <div class="row-btns" style={{ marginTop: '8px' }}>
        <button class="btn primary" style={{ flex: 1 }} disabled={!valid} onClick={save}>
          {isNew ? 'Add payment' : 'Save'}
        </button>
        {!isNew && !confirmDelete && (
          <button class="btn danger" onClick={() => setConfirmDelete(true)}>
            Stop or remove
          </button>
        )}
      </div>
      {confirmDelete && (
        <div class="card flat" style={{ marginTop: '12px' }}>
          {(s.kind === 'monthly' || s.kind === 'weekly' || s.kind === 'once') && (
            <button class="btn block" style={{ marginBottom: '8px' }} onClick={() => {
              const sch: Schedule = s.kind === 'once' ? { ...s, dates: s.dates.filter((d) => d < today) } : { ...s, end: addDays(today, -1) };
              saveItem({ ...it, schedule: sch });
              onClose();
            }}>
              Stop it from today (keep the past)
            </button>
          )}
          <button class="btn danger block" onClick={() => { deleteItem(it.id); onClose(); }}>
            Remove it completely
          </button>
          <p class="muted small">Removing takes it out of every week, past and future.</p>
        </div>
      )}
      {!me() && <p class="muted small">Tip: choose who you are in Settings so changes show your name.</p>}
    </Sheet>
  );
}

export { ordinal, weekday };
