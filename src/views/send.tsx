import { useState } from 'preact/hooks';
import { addDays, diffDays, nice, short } from '../engine/dates';
import { money, parseAmount, round2 } from '../engine/money';
import { occurrences } from '../engine/plan';
import { defaultPayDay, isCard, payItemFor, sendPlan, type SendPlan } from '../engine/send';
import type { Occ, State } from '../engine/types';
import { live } from '../engine/types';
import { me, saveItem, saveSettings } from '../store';
import { Field, Icon, MoneyInput, Sheet } from '../ui';

/** Whose rand salary the pay-day transfer is for: this device's person if they have one, else the first who does. */
export function sendPerson(state: State): string | undefined {
  const m = me();
  if (m && payItemFor(state, m)) return m;
  return live(state.people).find((p) => payItemFor(state, p.id))?.id;
}

function planFor(state: State, today: string, rate: number, payDay?: string): SendPlan | undefined {
  const person = sendPerson(state);
  if (!person) return undefined;
  const pi = payItemFor(state, person)!;
  const day = payDay || defaultPayDay(state, pi, today);
  if (!day) return undefined;
  return sendPlan(state, { person, payDay: day, rate });
}

/** The short version on Today: tap for the full working. */
export function SendCard({ state, today, liveRate, onOpen }: { state: State; today: string; liveRate?: number; onOpen: () => void }) {
  const p = planFor(state, today, liveRate || state.settings.rate);
  if (!p) return null;
  const days = diffDays(p.payDay, today);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : nice(p.payDay);
  return (
    <button class="card send-card" onClick={onOpen} aria-label="Pay day: how much to send to the UK">
      <div class="eyebrow">Pay day {when} · send to the UK</div>
      <div class="send-row">
        <div>
          <div class="num send-big">{money(p.sendZAR, 'ZAR')}</div>
          <div class="muted small">≈ {money(p.sendGBP)} · lasts until {nice(p.until)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div class={`num send-mid ${p.leftForCards < 0 ? 'neg' : ''}`}>{money(p.leftForCards, 'ZAR')}</div>
          <div class="muted small">left for the credit cards</div>
        </div>
      </div>
      <div class="send-more">
        See how it is worked out <Icon name="chevron" />
      </div>
    </button>
  );
}

export function SendSheet({ state, today, liveRate, liveDate, onClose, onEnterBalance }: { state: State; today: string; liveRate?: number; liveDate?: string; onClose: () => void; onEnterBalance: (date: string) => void }) {
  const first = planFor(state, today, liveRate || state.settings.rate);
  const [payDay, setPayDay] = useState(first?.payDay || today);
  const [rateText, setRateText] = useState(String(round2(liveRate || state.settings.rate)));
  const typed = parseAmount(rateText);
  const rate = typed && typed > 1 && typed < 100 ? typed : liveRate || state.settings.rate;
  const p = planFor(state, today, rate, payDay);
  const [copied, setCopied] = useState(false);
  const [showUk, setShowUk] = useState(false);

  if (!p) {
    return (
      <Sheet title="Send to the UK" onClose={onClose}>
        <p class="muted">No rand salary in the plan yet. Add your salary as a monthly payment in rand and this works itself out.</p>
      </Sheet>
    );
  }

  const acct = state.accounts[p.account]?.name || 'UK account';
  // payments since the bank figure that make up "before the money lands"
  const since = p.anchor && p.anchor.date < p.payDay ? occurrences(state, p.anchor.date, addDays(p.payDay, -1)).filter((o) => o.item.account === p.account && o.item.currency === 'GBP') : [];
  const onNextPayDay = p.nextPay ? occurrences(state, p.nextPay.date, p.nextPay.date).filter((o) => o.item.account === p.account && o.item.currency === 'GBP' && o.gbp < 0) : [];
  const nextDayTotal = onNextPayDay.reduce((s, o) => s + o.amount, 0);

  return (
    <Sheet title="Send to the UK" onClose={onClose}>
      <div class="send-result">
        <div class="eyebrow">Send from South Africa</div>
        <div class="num send-hero">{money(p.sendZAR, 'ZAR')}</div>
        <div class="muted small">
          = {money(p.sendGBP)} at R{round2(p.rate)} to the pound · lasts {nice(p.payDay)} – {nice(p.until)}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
          <button
            class="btn small"
            onClick={() => {
              navigator.clipboard?.writeText(String(p.sendZAR)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy amount'}
          </button>
        </div>
        <div class="send-left">
          <span>Left for the credit cards</span>
          <b class={`num ${p.leftForCards < 0 ? 'neg' : ''}`}>{money(p.leftForCards, 'ZAR')}</b>
        </div>
        {p.leftForCards < 0 && <p class="small neg" style={{ margin: '6px 0 0' }}>The salary does not cover the transfer and the rand payments this month.</p>}
      </div>

      <div class="send-inputs">
        <Field label="Pay day" hint={p.payItem.dayConfirmed ? undefined : `The plan has ${p.payItem.name} on the ${short(p.pay.orig, false)} (day not confirmed).`}>
          <input class="input" type="date" value={payDay} onInput={(e) => setPayDay((e.target as HTMLInputElement).value || payDay)} />
        </Field>
        <Field
          label="Rand to the pound"
          hint={liveRate ? <>Today’s market rate is R{liveRate.toFixed(2)}{liveDate ? ` (${short(liveDate, false)})` : ''}. Your bank’s rate is usually a little worse — type the rate it shows for the exact figure.</> : 'Could not fetch today’s rate — using the plan’s rate. Type the rate your bank shows.'}
        >
          <input class="input" inputMode="decimal" value={rateText} onInput={(e) => setRateText((e.target as HTMLInputElement).value)} />
        </Field>
        <Field group label="Safety cushion" hint="Extra pounds on top, in case the month costs more than planned. Kept for next time.">
          <MoneyInput value={p.cushion || null} currency="GBP" label="Safety cushion" onValue={(v) => saveSettings({ sendCushion: v ? round2(v) : 0 })} />
        </Field>
      </div>

      <h2 class="section">In the UK · {acct}</h2>
      <div class="card">
        <button class="kv send-kv-btn" onClick={() => setShowUk(!showUk)} aria-expanded={showUk}>
          <span>
            {p.ukOut.length} payments {short(p.payDay, false)} – {short(p.until, false)} <span class="muted">{showUk ? 'hide' : 'show'}</span>
          </span>
          <b class="num">{money(p.ukTotal, 'GBP', { exact: true })}</b>
        </button>
        {showUk && (
          <div class="send-list">
            {p.ukOut.map((o) => (
              <Line o={o} />
            ))}
          </div>
        )}
        <div class="kv">
          <span>
            {p.startBal >= 0 ? `Already in ${acct} before the money lands` : `${acct} is short before the money lands`}
            <div class="muted small">
              {p.anchor ? (
                <>
                  {money(p.anchor.amount, 'GBP', { exact: true })} you entered for {nice(p.anchor.date)}
                  {since.length > 0 && <>, then {since.map((o) => `${o.item.name} ${money(Math.abs(o.gbp))}${o.paid ? '' : ' (not ticked)'}`).join(', ')}</>}
                </>
              ) : (
                'No bank figure entered yet.'
              )}
            </div>
          </span>
          <b class={`num ${p.startBal < 0 ? 'neg' : ''}`}>{p.startBal >= 0 ? '−' : '+'}{money(Math.abs(p.startBal), 'GBP', { exact: true })}</b>
        </div>
        {(p.anchorIsPlaceholder || !p.anchor || diffDays(p.payDay, p.anchor.date) > 2) && (
          <button class="btn small" style={{ margin: '2px 0 8px' }} onClick={() => onEnterBalance(p.payDay <= today ? p.payDay : today)}>
            Enter what {acct} shows now
          </button>
        )}
        {p.cushion > 0 && (
          <div class="kv">
            <span>Safety cushion</span>
            <b class="num">+{money(p.cushion, 'GBP', { exact: true })}</b>
          </div>
        )}
        <div class="kv send-total">
          <span>Needed in {acct}</span>
          <b class="num">{money(p.needGBP, 'GBP', { exact: true })}</b>
        </div>
        <div class="kv">
          <span>× R{round2(p.rate)}, rounded up to the next R100</span>
          <b class="num">{money(p.sendZAR, 'ZAR')}</b>
        </div>
        {onNextPayDay.length > 0 && (
          <p class="small muted" style={{ margin: '6px 0 0' }}>
            Not in this month: {onNextPayDay.map((o) => o.item.name).join(', ')} ({money(nextDayTotal)}) fall on the next pay day, {nice(p.nextPay!.date)}, and come out of that transfer. If a transfer takes a day or two to land, they need money already in {acct}.
          </p>
        )}
      </div>

      <h2 class="section">In South Africa · rand</h2>
      <div class="card">
        <div class="kv">
          <span>{p.payItem.name}</span>
          <b class="num">{money(p.salary, 'ZAR')}</b>
        </div>
        <div class="kv">
          <span>Sent to the UK</span>
          <b class="num">−{money(p.sendZAR, 'ZAR')}</b>
        </div>
        {p.randOut.map((o) => (
          <RandLine o={o} />
        ))}
        <div class="kv send-total">
          <span>Left for the credit cards</span>
          <b class={`num ${p.leftForCards < 0 ? 'neg' : ''}`}>{money(p.leftForCards, 'ZAR')}</b>
        </div>
        {p.cards.length > 0 && (
          <>
            <p class="small muted" style={{ margin: '8px 0 2px' }}>The plan had this for the cards — the figure above replaces it:</p>
            {p.cards.map((o) => (
              <RandLine o={o} />
            ))}
          </>
        )}
        <p class="small muted" style={{ margin: '8px 0 0' }}>Tap “card” on a line to say whether it is a credit card (it then gets the leftover instead of being paid first).</p>
        {p.otherIn.length > 0 && (
          <p class="small muted" style={{ margin: '8px 0 0' }}>
            Not counted: {p.otherIn.map((o) => `${o.item.name} ${money(o.amount, 'ZAR')} on ${nice(o.date)}`).join(', ')}.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Line({ o }: { o: Occ }) {
  return (
    <div class="kv small send-line">
      <span>
        {short(o.date, false)} · {o.item.name}
        {o.item.kind === 'budget' && <span class="muted"> (budget)</span>}
        {o.paid && <span class="muted"> · paid</span>}
      </span>
      <span class="num">{money(o.amount, 'GBP', { exact: true })}</span>
    </div>
  );
}

function RandLine({ o }: { o: Occ }) {
  const card = isCard(o.item);
  return (
    <div class="kv send-line">
      <span>
        {o.item.name} <span class="muted small">· {short(o.date, false)}</span>
        <button class={`tag ${card ? 'good' : ''} send-card-tag`} aria-pressed={card} onClick={() => saveItem({ ...o.item, card: !card })}>
          {card ? 'card ✓' : 'card?'}
        </button>
      </span>
      <b class="num">{card ? money(o.amount, 'ZAR') : '−' + money(o.amount, 'ZAR')}</b>
    </div>
  );
}
