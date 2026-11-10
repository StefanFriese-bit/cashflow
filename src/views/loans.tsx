import { useState } from 'preact/hooks';
import { diffDays, nice, short } from '../engine/dates';
import { money, round2 } from '../engine/money';
import { goalStatus, loanStatus, toGBP } from '../engine/plan';
import type { Goal, Loan, Note, State } from '../engine/types';
import { live } from '../engine/types';
import { newId, saveGoal, saveLoan, saveNote, saveRepayment } from '../store';
import { Field, Icon, MoneyInput, Sheet } from '../ui';
import type { Nav } from '../app';

export function Loans({ state, today, nav }: { state: State; today: string; nav: Nav }) {
  const [open, setOpen] = useState<string | null>(null);
  const [addRep, setAddRep] = useState<string | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const rate = state.settings.rate;
  const loans = live(state.loans).map((l) => loanStatus(state, l.id, today)).sort((a, b) => b.remaining - a.remaining);
  const total = loans.reduce((s, l) => s + l.remaining, 0);
  const goals = live(state.goals).map((g) => goalStatus(state, g.id, today));

  return (
    <div>
      <h1 class="title">Loans &amp; goals</h1>
      <p class="subtitle">What is still owed in South Africa, what you are saving for, and your notes.</p>

      <div class="cols">
        <div>
          <div class="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div class="eyebrow">Still owed</div>
              <div class="num" style={{ fontSize: '32px', fontWeight: 560 }}>{money(total, 'ZAR')}</div>
              <div class="muted small">≈ {money(toGBP(total, 'ZAR', rate))} at R{rate}</div>
            </div>
            <button class="btn small" onClick={() => setEditLoan({ id: newId('l'), name: '', currency: 'ZAR', principal: 0, u: 0 })}>
              <Icon name="plus" /> Loan
            </button>
          </div>

          {loans.map((l) => {
            const pct = l.loan.principal ? Math.min(100, (l.paid / l.loan.principal) * 100) : 0;
            const plannedTotal = l.planned.reduce((s, o) => s + o.amount, 0);
            const pct2 = l.loan.principal ? Math.min(100 - pct, (Math.min(plannedTotal, l.remaining) / l.loan.principal) * 100) : 0;
            const isOpen = open === l.loan.id;
            return (
              <section class="card" aria-label={`Loan ${l.loan.name}`}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <h3 style={{ flex: 1, fontSize: '18px', fontFamily: 'var(--display)', margin: '0px' }}>{l.loan.name}</h3>
                  {l.remaining <= 0.5 ? (
                    <span class="stamp">Paid off</span>
                  ) : (
                    <span class="num" style={{ fontSize: '20px' }}>{money(l.remaining, l.loan.currency)} left</span>
                  )}
                </div>
                <div class="progress" style={{ margin: '10px 0 8px' }} aria-hidden="true">
                  <i style={{ width: `${pct}%`, background: 'var(--good)' }} />
                  <i style={{ width: `${pct2}%`, background: 'color-mix(in srgb, var(--good) 30%, transparent)' }} />
                </div>
                <div class="muted small">
                  Paid {money(l.paid, l.loan.currency)} of {money(l.loan.principal, l.loan.currency)}
                  {l.remaining > 0.5 && l.clearOn && <> · planned to be clear on <b style={{ color: 'var(--ink)' }}>{nice(l.clearOn)}</b> ({diffDays(l.clearOn, today)} days)</>}
                  {l.remaining > 0.5 && !l.clearOn && <> · {plannedTotal ? `${money(l.shortfall, l.loan.currency)} not yet planned` : 'no repayments planned yet'}</>}
                </div>
                {l.planned.length > 0 && l.remaining > 0.5 && (
                  <div style={{ marginTop: '10px' }}>
                    {l.planned.slice(0, 3).map((o) => (
                      <button class="kv" style={{ width: '100%', border: '0px', background: 'none', padding: '4px 0' }} onClick={() => nav.openOcc(o.key)}>
                        <span>Planned · {nice(o.date)}</span>
                        <b class="num">{money(o.amount, o.item.currency)}</b>
                      </button>
                    ))}
                  </div>
                )}
                <div class="row-btns" style={{ marginTop: '10px' }}>
                  <button class="btn small" onClick={() => setOpen(isOpen ? null : l.loan.id)}>
                    {isOpen ? 'Hide' : 'History'} ({l.reps.length})
                  </button>
                  <button class="btn small" onClick={() => setAddRep(l.loan.id)}>
                    <Icon name="plus" /> Repayment
                  </button>
                  <button class="btn small ghost" onClick={() => setEditLoan(l.loan)}>
                    Edit
                  </button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: '8px' }}>
                    {[...l.reps].reverse().map((r) => (
                      <div class="kv">
                        <span>
                          {r.date ? short(r.date) : r.note || 'No date'}
                          {r.date && r.note && <span class="muted"> · {r.note}</span>}
                        </span>
                        <b class="num">{money(r.amount, l.loan.currency)}</b>
                      </div>
                    ))}
                    {l.loan.note && <p class="muted small">{l.loan.note}</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div>
          {goals.map((g) => {
            const pct = Math.min(100, (g.saved / g.goal.target) * 100);
            const pct2 = Math.min(100 - pct, (g.planned / g.goal.target) * 100);
            return (
              <section class="card">
                <div class="eyebrow">Saving for</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <h3 style={{ flex: 1, fontSize: '22px', fontFamily: 'var(--display)', margin: '2px 0 0' }}>{g.goal.name}</h3>
                  <button class="btn small ghost" onClick={() => setEditGoal(g.goal)}>
                    Edit
                  </button>
                </div>
                <div class="num" style={{ fontSize: '30px', fontWeight: 560, margin: '4px 0 8px' }}>
                  {money(g.saved, g.goal.currency)} <span class="muted small" style={{ fontFamily: 'var(--text)' }}>of {money(g.goal.target, g.goal.currency)}</span>
                </div>
                <div class="progress" aria-hidden="true">
                  <i style={{ width: `${pct}%`, background: 'var(--good)' }} />
                  <i style={{ width: `${pct2}%`, background: 'color-mix(in srgb, var(--good) 30%, transparent)' }} />
                </div>
                <div class="kv" style={{ marginTop: '8px' }}>
                  <span>Still planned</span>
                  <b>{money(g.planned, g.goal.currency)}</b>
                </div>
                {g.goal.by && (
                  <div class="kv">
                    <span>Needed by</span>
                    <b>
                      {short(g.goal.by)} · {Math.max(0, Math.round(diffDays(g.goal.by, today) / 30.44))} months
                    </b>
                  </div>
                )}
                <div class="kv">
                  <span>{g.short > 0.5 ? 'Short at the end' : 'At the end'}</span>
                  <b class={g.short > 0.5 ? 'neg' : 'pos'}>{g.short > 0.5 ? money(g.short, g.goal.currency) : `${money(g.projected - g.goal.target, g.goal.currency)} spare`}</b>
                </div>
                {g.goal.note && <p class="muted small">{g.goal.note}</p>}
              </section>
            );
          })}

          <h2 class="section">Notes</h2>
          {live(state.notes).map((n) => (
            <button class="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => setEditNote(n)}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="note" class="muted" /> {n.title}
              </h3>
              <div class="note-body" style={{ maxHeight: '160px', overflow: 'hidden' }}>{n.body}</div>
            </button>
          ))}
          <button class="btn small" onClick={() => setEditNote({ id: newId('n'), title: '', body: '', u: 0 })}>
            <Icon name="plus" /> Note
          </button>
        </div>
      </div>

      {addRep && <RepaymentSheet state={state} loanId={addRep} today={today} onClose={() => setAddRep(null)} />}
      {editLoan && <LoanSheet loan={editLoan} onClose={() => setEditLoan(null)} />}
      {editGoal && <GoalSheet goal={editGoal} onClose={() => setEditGoal(null)} />}
      {editNote && <NoteSheet note={editNote} onClose={() => setEditNote(null)} />}
    </div>
  );
}

function RepaymentSheet({ state, loanId, today, onClose }: { state: State; loanId: string; today: string; onClose: () => void }) {
  const loan = state.loans[loanId];
  const [amt, setAmt] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  return (
    <Sheet title={`Repayment · ${loan.name}`} onClose={onClose}>
      <p class="muted small" style={{ marginTop: '0px' }}>For a repayment made outside the planned payments. (Ticking a planned loan payment off records it here by itself.)</p>
      <Field group label="Amount">
        <MoneyInput value={amt} currency={loan.currency} onValue={setAmt} autoFocus />
      </Field>
      <Field label="Date">
        <input class="input" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Note">
        <input class="input" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
      </Field>
      <button class="btn primary block" disabled={!amt} onClick={() => { saveRepayment({ id: newId('r'), loan: loanId, date, amount: round2(amt!), note: note || undefined, u: 0 }); onClose(); }}>
        Save
      </button>
    </Sheet>
  );
}

function LoanSheet({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const [l, setL] = useState(loan);
  return (
    <Sheet title={loan.name ? `Loan · ${loan.name}` : 'New loan'} onClose={onClose}>
      <Field label="Who lent it">
        <input class="input" value={l.name} onInput={(e) => setL({ ...l, name: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field group label="Amount borrowed (in total)">
        <MoneyInput value={l.principal} currency={l.currency} onValue={(v) => setL({ ...l, principal: v ?? 0 })} onCurrency={(c) => setL({ ...l, currency: c })} />
      </Field>
      <Field label="Note">
        <textarea class="input" value={l.note || ''} onInput={(e) => setL({ ...l, note: (e.target as HTMLTextAreaElement).value || undefined })} />
      </Field>
      <button class="btn primary block" disabled={!l.name.trim() || !l.principal} onClick={() => { saveLoan({ ...l, name: l.name.trim() }); onClose(); }}>
        Save
      </button>
    </Sheet>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [g, setG] = useState(goal);
  return (
    <Sheet title={`Goal · ${goal.name}`} onClose={onClose}>
      <Field label="Name">
        <input class="input" value={g.name} onInput={(e) => setG({ ...g, name: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field group label="Target">
        <MoneyInput value={g.target} currency={g.currency} onValue={(v) => setG({ ...g, target: v ?? 0 })} />
      </Field>
      <Field label="Needed by">
        <input class="input" type="date" value={g.by || ''} onInput={(e) => setG({ ...g, by: (e.target as HTMLInputElement).value || undefined })} />
      </Field>
      <Field group label="Already put aside before (not in the plan)">
        <MoneyInput value={g.start || 0} currency={g.currency} onValue={(v) => setG({ ...g, start: v ?? 0 })} />
      </Field>
      <Field label="Note">
        <textarea class="input" value={g.note || ''} onInput={(e) => setG({ ...g, note: (e.target as HTMLTextAreaElement).value || undefined })} />
      </Field>
      <button class="btn primary block" disabled={!g.name.trim() || !g.target} onClick={() => { saveGoal(g); onClose(); }}>
        Save
      </button>
    </Sheet>
  );
}

function NoteSheet({ note, onClose }: { note: Note; onClose: () => void }) {
  const [n, setN] = useState(note);
  return (
    <Sheet title={note.title || 'New note'} onClose={onClose}>
      <Field label="Title">
        <input class="input" value={n.title} onInput={(e) => setN({ ...n, title: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field label="Note">
        <textarea class="input" style={{ minHeight: '280px' }} value={n.body} onInput={(e) => setN({ ...n, body: (e.target as HTMLTextAreaElement).value })} />
      </Field>
      <div class="row-btns">
        <button class="btn primary" style={{ flex: 1 }} disabled={!n.title.trim()} onClick={() => { saveNote(n); onClose(); }}>
          Save
        </button>
        {state_has(note) && (
          <button class="btn danger" onClick={() => { saveNote({ ...n, del: true }); onClose(); }}>
            Delete
          </button>
        )}
      </div>
    </Sheet>
  );
}
function state_has(n: Note) {
  return n.u > 0;
}
