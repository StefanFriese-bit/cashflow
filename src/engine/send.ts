// Pay day: how much of a rand salary to send to the UK so the UK account lasts until the next pay day,
// and what is left in South Africa for the credit cards.
//
// The UK side only counts POUND payments that go out of the person's own UK account. The SA side only counts
// RAND payments. The salary itself never counts as money already in the UK account.

import { addDays, weekStart } from './dates';
import { balDate, latestBalance, occurrences } from './plan';
import type { Balance, ISODate, Item, Occ, State } from './types';
import { live } from './types';

export interface SendPlan {
  person: string;
  account: string; // the UK account the money goes to
  payItem: Item;
  pay: Occ; // this pay day's salary payment
  payDay: ISODate;
  from: ISODate; // Monday of the pay-day week: payments count by week, not by exact day
  until: ISODate; // last day the money has to last (the Sunday before the next pay day's week)
  nextPay?: Occ;
  salary: number; // rand

  ukOut: Occ[]; // pound payments out of the UK account, pay day … until
  ukTotal: number;
  /** What the UK account holds the morning of pay day, before the transfer lands (pounds). */
  startBal: number;
  anchor?: Balance; // the bank figure that start is worked out from
  anchorIsPlaceholder: boolean;
  since: Occ[]; // payments between that figure and the pay-day week
  cushion: number;
  needGBP: number;
  rate: number;
  sendZAR: number; // rounded up to the next R100
  sendGBP: number; // what sendZAR buys at `rate`

  randOut: Occ[]; // rand payments that come out of the salary first (debit orders, loans …)
  randTotal: number;
  cards: Occ[]; // rand credit-card payments already in the plan (the leftover replaces them)
  cardsPlanned: number;
  otherIn: Occ[]; // other rand money coming in during the month (not counted)
  leftForCards: number; // rand
}

export function isCard(item: Item): boolean {
  return item.card ?? /\bcards?\b/i.test(item.name);
}

/** The person's rand salary: their biggest monthly rand income. */
export function payItemFor(state: State, person: string): Item | undefined {
  return live(state.items)
    .filter((i) => i.person === person && i.kind === 'income' && i.currency === 'ZAR' && i.schedule.kind === 'monthly')
    .sort((a, b) => b.amount - a.amount)[0];
}

/** The UK account the person pays from. */
export function ukAccountFor(state: State, person: string): string | undefined {
  return live(state.accounts).find((a) => a.owner === person)?.id;
}

/**
 * Which pay day to plan for, seen from `today`:
 * - the salary was due in the last 10 days but is not ticked as received yet → it is still coming: today;
 * - it was ticked as received in the last 10 days → that day;
 * - otherwise the next one.
 */
export function defaultPayDay(state: State, payItem: Item, today: ISODate): ISODate | undefined {
  const one = { ...state, items: { [payItem.id]: payItem } };
  const recent = occurrences(one, addDays(today, -10), today);
  const last = recent[recent.length - 1];
  if (last) return last.paid ? last.date : today;
  return occurrences(one, addDays(today, 1), addDays(today, 70))[0]?.date;
}

export function sendPlan(
  state: State,
  opts: { person: string; payDay: ISODate; rate: number; cushion?: number },
): SendPlan | undefined {
  const { person, payDay, rate } = opts;
  const payItem = payItemFor(state, person);
  const account = ukAccountFor(state, person);
  if (!payItem || !account || !(rate > 0)) return undefined;
  const one = { ...state, items: { [payItem.id]: payItem } };

  // this month's salary: the one nearest the chosen day (it may be late, early, or moved)
  const around = occurrences(one, addDays(payDay, -20), addDays(payDay, 20));
  const pay = around.slice().sort((a, b) => Math.abs(diff(a.date, payDay)) - Math.abs(diff(b.date, payDay)))[0];
  if (!pay) return undefined;
  const nextPay = occurrences(one, addDays(payDay, 1), addDays(payDay, 70)).find((o) => o.key !== pay.key && o.orig > pay.orig);
  // whole weeks: from the Monday of the pay-day week to the Sunday before the next pay day's week
  const from = weekStart(payDay);
  const until = nextPay ? addDays(weekStart(nextPay.date), -1) : addDays(from, 34);
  const salary = pay.amount;

  // The UK account before the transfer lands: the newest figure entered on or before pay day. A payment still on
  // the list counts from that figure on, whatever its day in the week (see balDate); one removed is gone.
  const anchor = latestBalance(state, account, payDay);
  const after = (o: Occ) => !anchor || balDate(state, o) >= anchor.date;
  const ukGBP = (o: Occ) => o.item.account === account && o.item.currency === 'GBP';

  const month = occurrences(state, from, until);
  // paid or not: a payment ticked off after the transfer was still paid with the transferred money
  const ukOut = month.filter((o) => ukGBP(o) && o.gbp < 0 && after(o));
  const ukTotal = sum(ukOut);

  let startBal = 0;
  let since: Occ[] = [];
  if (anchor) {
    if (anchor.date < from) since = occurrences(state, weekStart(anchor.date), addDays(from, -1)).filter((o) => ukGBP(o) && after(o));
    startBal = anchor.amount + since.reduce((s, o) => s + o.gbp, 0);
  }

  const cushion = Math.max(0, opts.cushion ?? state.settings.sendCushion ?? 0);
  const needGBP = Math.max(0, ukTotal - startBal + cushion);
  const sendZAR = needGBP > 0 ? Math.ceil((needGBP * rate) / 100) * 100 : 0;

  const rand = month.filter((o) => o.item.currency === 'ZAR');
  const randBills = rand.filter((o) => o.item.kind !== 'income');
  const cards = randBills.filter((o) => isCard(o.item));
  const randOut = randBills.filter((o) => !isCard(o.item));
  const randTotal = sum(randOut);
  const otherIn = rand.filter((o) => o.item.kind === 'income' && o.key !== pay.key);

  return {
    person,
    account,
    payItem,
    pay,
    payDay,
    from,
    until,
    nextPay,
    salary,
    ukOut,
    ukTotal,
    startBal,
    anchor,
    anchorIsPlaceholder: !!anchor?.id.endsWith('-start'),
    since,
    cushion,
    needGBP,
    rate,
    sendZAR,
    sendGBP: sendZAR / rate,
    randOut,
    randTotal,
    cards,
    cardsPlanned: sum(cards),
    otherIn,
    leftForCards: salary - sendZAR - randTotal,
  };
}

function sum(list: Occ[]): number {
  return list.reduce((s, o) => s + o.amount, 0);
}
function diff(a: ISODate, b: ISODate): number {
  return (Date.parse(a) - Date.parse(b)) / 86400000;
}
