import { addDays, addMonths, daysInMonth, diffDays, iso, monthEnd, monthStart, ordinal, parse, short, weekStart, weekday, ymd, dayName, monthName } from './dates';
import type { Currency, ISODate, Item, Occ, Schedule, State } from './types';
import { live } from './types';

// ---------- money ----------

export function toGBP(amount: number, currency: Currency, rate: number): number {
  return currency === 'GBP' ? amount : amount / rate;
}

export function amountAt(item: Item, date: ISODate): number {
  let a = item.amount;
  for (const s of [...(item.steps || [])].sort((x, y) => (x.from < y.from ? -1 : 1))) if (s.from <= date) a = s.amount;
  return a;
}

export function sign(item: Item): 1 | -1 {
  return item.kind === 'income' ? 1 : -1;
}

// ---------- schedules ----------

/** The dates a schedule gives, between from and to (inclusive). */
export function scheduleDates(s: Schedule, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (s.kind === 'none') return out;
  if (s.kind === 'once') return s.dates.filter((d) => d >= from && d <= to).sort();
  if (s.kind === 'weekly') {
    const step = 7 * Math.max(1, s.every || 1);
    let d = s.start;
    let n = 0;
    // jump close to `from` without walking day by day
    if (d < from) {
      const k = Math.floor(diffDays(from, d) / step);
      d = addDays(d, k * step);
      n = k;
    }
    for (; d <= to; d = addDays(d, step), n++) {
      if (s.count && n >= s.count) break;
      if (s.end && d > s.end) break;
      if (d >= from && d >= s.start) out.push(d);
    }
    return out;
  }
  // monthly
  const days = [...new Set(s.days)].sort((a, b) => a - b);
  let [y, m] = ymd(s.start > from ? s.start : from);
  // count needs every date from the start, so walk from the start when there is a count
  if (s.count) [y, m] = ymd(s.start);
  let n = 0;
  for (;;) {
    const first = iso(y, m, 1);
    if (first > to) break;
    if (!(s.skipMonths || []).includes(m)) {
      for (const dd of days) {
        const d = iso(y, m, Math.min(dd, daysInMonth(y, m)));
        if (d < s.start) continue;
        if (s.end && d > s.end) return out;
        if (s.count && n >= s.count) return out;
        n++;
        if (d >= from && d <= to) out.push(d);
      }
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** "25th of every month", "every week (Mon)", "every 4 weeks (Mon)", "21 Dec 2026" */
export function scheduleText(s: Schedule): string {
  if (s.kind === 'none') return 'No date yet';
  if (s.kind === 'once') return s.dates.length ? s.dates.map((d) => short(d)).join(', ') : 'No date yet';
  if (s.kind === 'weekly') {
    const w = dayName(s.start);
    return s.every === 1 ? `Every week (${w})` : s.every === 2 ? `Every 2 weeks (${w})` : `Every ${s.every} weeks (${w})`;
  }
  const days = s.days.map(ordinal);
  const list = days.length > 1 ? days.slice(0, -1).join(', ') + ' and ' + days[days.length - 1] : days[0];
  let t = `${list} of every month`;
  if (s.skipMonths?.length) t += `, not in ${s.skipMonths.map((m) => monthName(m)).join(' or ')}`;
  return t;
}

export function scheduleEndText(s: Schedule): string {
  if (s.kind === 'monthly' || s.kind === 'weekly') {
    if (s.count) return `${s.count} payments from ${short(s.start)}`;
    if (s.end) return `until ${short(s.end)}`;
  }
  return '';
}

// ---------- occurrences ----------

// Every screen asks for payments in many date ranges. Work the whole span out once per version of the plan
// (each change makes a new plan object), then hand out slices of it.
const WIN_FROM = '2025-01-01';
const WIN_TO = '2031-12-31';
const cache = new WeakMap<State, { all?: Occ[]; withSkipped?: Occ[] }>();

function slice(list: Occ[], from: ISODate, to: ISODate): Occ[] {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].date < from) lo = mid + 1;
    else hi = mid;
  }
  const out: Occ[] = [];
  for (let i = lo; i < list.length && list[i].date <= to; i++) out.push(list[i]);
  return out;
}

/** Every payment that counts between from and to, with one-off changes applied. Skipped ones are left out. */
export function occurrences(state: State, from: ISODate, to: ISODate, opts: { includeSkipped?: boolean } = {}): Occ[] {
  if (from >= WIN_FROM && to <= WIN_TO) {
    let c = cache.get(state);
    if (!c) cache.set(state, (c = {}));
    const k = opts.includeSkipped ? 'withSkipped' : 'all';
    if (!c[k]) c[k] = computeOccurrences(state, WIN_FROM, WIN_TO, opts);
    return slice(c[k]!, from, to);
  }
  return computeOccurrences(state, from, to, opts);
}

function computeOccurrences(state: State, from: ISODate, to: ISODate, opts: { includeSkipped?: boolean } = {}): Occ[] {
  const rate = state.settings.rate;
  const out: Occ[] = [];
  // a payment can be moved up to 120 days, so look a bit wider and filter on the final date
  const wideFrom = addDays(from, -120);
  const wideTo = addDays(to, 120);
  const ovByItem = new Map<string, ISODate[]>();
  for (const o of live(state.overrides)) {
    if (!ovByItem.has(o.item)) ovByItem.set(o.item, []);
    ovByItem.get(o.item)!.push(o.date);
  }
  for (const item of live(state.items)) {
    const scheduled = new Set(scheduleDates(item.schedule, wideFrom, wideTo));
    const dates = new Set(scheduled);
    // a payment whose schedule date was later edited away, but which was ticked off, still counts
    for (const d of ovByItem.get(item.id) || []) if (d >= wideFrom && d <= wideTo) dates.add(d);
    for (const orig of dates) {
      const key = `${item.id}|${orig}`;
      const ov = state.overrides[key];
      const live_ = ov && !ov.del ? ov : undefined;
      if (!scheduled.has(orig) && !live_?.paid) continue;
      if (live_?.skip && !opts.includeSkipped) continue;
      const planned = amountAt(item, orig);
      const amount = live_?.paid ? live_.paid.amount : live_?.amount ?? planned;
      const date = live_?.paid ? live_.paid.on : live_?.moveTo ?? orig;
      if (date < from || date > to) continue;
      out.push({
        key,
        item,
        orig,
        date,
        amount,
        gbp: sign(item) * toGBP(amount, item.currency, rate),
        paid: live_?.paid,
        moved: date !== orig,
        changed: Math.abs(amount - planned) > 0.004,
      });
    }
  }
  // same day: money in first, then the biggest payments
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(b.gbp > 0) - Number(a.gbp > 0) || Math.abs(b.gbp) - Math.abs(a.gbp) || a.item.name.localeCompare(b.item.name)));
  return out;
}

export function nextOccurrence(state: State, item: Item, today: ISODate): Occ | undefined {
  return occurrences({ ...state, items: { [item.id]: item } }, today, addDays(today, 800)).find((o) => !o.paid);
}

// ---------- balances ----------

export function latestBalance(state: State, account: string, onOrBefore?: ISODate) {
  return live(state.balances)
    .filter((b) => b.account === account && (!onOrBefore || b.date <= onOrBefore))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.u - a.u))[0];
}

/** Balance at the END of `date`. Starts from the newest balance you entered on or before that date. */
export function balanceAt(state: State, account: string, date: ISODate, occs?: Occ[]): number {
  const anchor = latestBalance(state, account, date) || live(state.balances).filter((b) => b.account === account).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!anchor) return 0;
  if (anchor.date <= date) {
    const list = occs ?? occurrences(state, anchor.date, date);
    return anchor.amount + list.filter((o) => o.item.account === account && o.date >= anchor.date && o.date <= date).reduce((s, o) => s + o.gbp, 0);
  }
  // before the first balance entered: walk backwards
  const list = occs ?? occurrences(state, addDays(date, 1), addDays(anchor.date, -1));
  return anchor.amount - list.filter((o) => o.item.account === account && o.date > date && o.date < anchor.date).reduce((s, o) => s + o.gbp, 0);
}

export interface WeekRow {
  start: ISODate;
  end: ISODate;
  occs: Occ[];
  open: Record<string, number>; // per account, balance at start of the week
  close: Record<string, number>; // per account, end of week
  inGBP: Record<string, number>; // per person
  outGBP: Record<string, number>; // per person
}

export function weeks(state: State, from: ISODate, count: number): WeekRow[] {
  const start = weekStart(from);
  const end = addDays(start, count * 7 - 1);
  const accounts = live(state.accounts);
  // take every payment from the earliest balance entered so balances are exact
  const firstAnchor = live(state.balances).map((b) => b.date).sort()[0] || start;
  const occFrom = firstAnchor < start ? firstAnchor : start;
  const all = occurrences(state, occFrom, end);
  const rows: WeekRow[] = [];
  for (let i = 0; i < count; i++) {
    const ws = addDays(start, i * 7);
    const we = addDays(ws, 6);
    const occs = all.filter((o) => o.date >= ws && o.date <= we);
    const open: Record<string, number> = {};
    const close: Record<string, number> = {};
    for (const a of accounts) {
      open[a.id] = balanceAt(state, a.id, addDays(ws, -1), all);
      close[a.id] = balanceAt(state, a.id, we, all);
    }
    const inGBP: Record<string, number> = {};
    const outGBP: Record<string, number> = {};
    for (const o of occs) {
      const p = o.item.person;
      if (o.gbp > 0) inGBP[p] = (inGBP[p] || 0) + o.gbp;
      else outGBP[p] = (outGBP[p] || 0) - o.gbp;
    }
    rows.push({ start: ws, end: we, occs, open, close, inGBP, outGBP });
  }
  return rows;
}

/** End-of-day balance for every day in a range (for the chart). */
export function dailyBalances(state: State, account: string, from: ISODate, to: ISODate): { date: ISODate; bal: number }[] {
  const firstAnchor = live(state.balances).filter((b) => b.account === account).map((b) => b.date).sort()[0] || from;
  const occs = occurrences(state, firstAnchor < from ? firstAnchor : from, to);
  const out: { date: ISODate; bal: number }[] = [];
  let bal = balanceAt(state, account, addDays(from, -1), occs);
  const anchors = live(state.balances).filter((b) => b.account === account);
  const mine = occs.filter((o) => o.item.account === account);
  let i = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const a = anchors.filter((b) => b.date === d).sort((x, y) => y.u - x.u)[0];
    if (a) bal = a.amount;
    while (i < mine.length && mine[i].date < d) i++;
    while (i < mine.length && mine[i].date === d) bal += mine[i++].gbp;
    out.push({ date: d, bal });
  }
  return out;
}

export function lowestPoint(state: State, account: string, from: ISODate, to: ISODate) {
  const days = dailyBalances(state, account, from, to);
  return days.reduce((lo, d) => (d.bal < lo.bal ? d : lo), days[0]);
}

// ---------- reminders ----------

export function needsTicking(o: Occ): boolean {
  return o.item.kind !== 'budget';
}

/** Unpaid payments within the next `days` days (today included). */
export function dueSoon(state: State, today: ISODate, days = state.settings.remindDays, onlyReminders = true): Occ[] {
  return occurrences(state, today, addDays(today, days)).filter(
    (o) => !o.paid && needsTicking(o) && o.item.kind !== 'income' && (!onlyReminders || o.item.remind),
  );
}

/** Past payments nobody has ticked off yet (from the day the app took over from the sheet). */
export function notTicked(state: State, today: ISODate): Occ[] {
  const from = state.settings.trackFrom;
  if (from >= today) return [];
  return occurrences(state, from, addDays(today, -1)).filter((o) => !o.paid && needsTicking(o));
}

// ---------- months, people ----------

export interface MonthSummary {
  month: ISODate; // first day
  person: string;
  income: number;
  out: number;
  saved: number;
  byGroup: Record<string, number>;
  left: number;
}

export function monthSummary(state: State, monthFirst: ISODate): Record<string, MonthSummary> {
  const occs = occurrences(state, monthStart(monthFirst), monthEnd(monthFirst));
  const res: Record<string, MonthSummary> = {};
  for (const p of live(state.people)) res[p.id] = { month: monthStart(monthFirst), person: p.id, income: 0, out: 0, saved: 0, byGroup: {}, left: 0 };
  for (const o of occs) {
    const r = res[o.item.person];
    if (!r) continue;
    const v = Math.abs(o.gbp);
    if (o.gbp > 0) r.income += v;
    else {
      if (o.item.kind === 'saving') r.saved += v;
      else r.out += v;
      r.byGroup[o.item.group] = (r.byGroup[o.item.group] || 0) + v;
    }
  }
  for (const r of Object.values(res)) r.left = r.income - r.out - r.saved;
  return res;
}

/** A typical month per item: what it costs per month on average over the next 12 months. */
export function monthlyEquivalent(state: State, item: Item, today: ISODate): number {
  const to = addDays(addMonths(today, 12), -1);
  const occs = occurrences({ ...state, items: { [item.id]: item } }, today, to);
  return occs.reduce((s, o) => s + Math.abs(o.gbp), 0) / 12;
}

// ---------- loans and goals ----------

export function loanStatus(state: State, loanId: string, today: ISODate) {
  const loan = state.loans[loanId];
  const reps = live(state.repayments).filter((r) => r.loan === loanId).sort((a, b) => (a.date || '0') < (b.date || '0') ? -1 : 1);
  const paid = reps.reduce((s, r) => s + r.amount, 0);
  const remaining = Math.max(0, loan.principal - paid);
  // planned repayments still to come (unpaid, from today)
  const planned = occurrences(state, today, addDays(today, 1500)).filter((o) => o.item.loan === loanId && !o.paid);
  let left = remaining;
  let clearOn: ISODate | undefined = remaining <= 0.5 ? reps[reps.length - 1]?.date || undefined : undefined;
  for (const o of planned) {
    if (left <= 0.5) break;
    left -= o.amount;
    if (left <= 0.5) clearOn = o.date;
  }
  return { loan, reps, paid, remaining, planned, clearOn, shortfall: Math.max(0, left) };
}

export function goalStatus(state: State, goalId: string, today: ISODate) {
  const goal = state.goals[goalId];
  const rate = state.settings.rate;
  const to = goal.by || addDays(today, 1500);
  const occs = occurrences(state, WIN_FROM, to < WIN_TO ? to : WIN_TO).filter((o) => o.item.goal === goalId);
  const toGoal = (o: Occ) => (goal.currency === 'GBP' ? toGBP(o.amount, o.item.currency, rate) : o.item.currency === 'ZAR' ? o.amount : o.amount * rate);
  const saved = (goal.start || 0) + occs.filter((o) => o.date < today || o.paid).reduce((s, o) => s + toGoal(o), 0);
  const planned = occs.filter((o) => o.date >= today && !o.paid).reduce((s, o) => s + toGoal(o), 0);
  return { goal, saved, planned, projected: saved + planned, short: Math.max(0, goal.target - saved - planned) };
}

export { weekday, parse };
