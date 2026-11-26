import { describe, expect, test } from 'vitest';
import { defaultPayDay, isCard, payItemFor, sendPlan } from '../src/engine/send';
import { emptyState, type Item, type State } from '../src/engine/types';

// Made-up household: Alex earns rand in South Africa and pays the UK bills from a UK account.
function home(): State {
  const u = 1;
  const s = emptyState(u);
  s.settings = { rate: 20, trackFrom: '2026-11-01', remindDays: 2, u };
  s.people.a = { id: 'a', name: 'Alex', tone: 'a', u };
  s.people.b = { id: 'b', name: 'Sam', tone: 'b', u };
  s.accounts.uk = { id: 'uk', name: 'UK Bank', owner: 'a', u };
  s.accounts.uk2 = { id: 'uk2', name: 'Sam Bank', owner: 'b', u };
  const add = (i: Partial<Item> & Pick<Item, 'id' | 'name' | 'amount' | 'schedule'>) => {
    s.items[i.id] = { u, person: 'a', account: 'uk', currency: 'GBP', kind: 'bill', group: 'X', dayConfirmed: true, remind: false, ...i } as Item;
  };
  add({ id: 'sal', name: 'Salary', kind: 'income', currency: 'ZAR', amount: 100000, schedule: { kind: 'monthly', days: [25], start: '2026-11-01' } });
  add({ id: 'bonus', name: 'Bonus', kind: 'income', currency: 'ZAR', amount: 50000, schedule: { kind: 'once', dates: ['2026-12-10'] } });
  add({ id: 'rent', name: 'Rent', amount: 1000, schedule: { kind: 'monthly', days: [1], start: '2026-12-01' } });
  add({ id: 'food', name: 'Food', kind: 'budget', amount: 100, schedule: { kind: 'weekly', every: 1, start: '2026-11-02' } }); // Mondays
  add({ id: 'loan', name: 'Loan', currency: 'ZAR', amount: 5000, schedule: { kind: 'monthly', days: [26], start: '2026-11-01' } });
  add({ id: 'cards', name: 'Bank cards', currency: 'ZAR', amount: 30000, schedule: { kind: 'monthly', days: [26], start: '2026-11-01' } });
  // Sam's own bills never count
  add({ id: 'sam', name: 'Sam phone', person: 'b', account: 'uk2', amount: 50, schedule: { kind: 'monthly', days: [2], start: '2026-11-01' } });
  s.balances.b1 = { id: 'b1', account: 'uk', date: '2026-11-20', amount: 300, u };
  return s;
}

describe('pay day: send to the UK', () => {
  test('the rand salary is found, not the one-off bonus', () => {
    expect(payItemFor(home(), 'a')?.id).toBe('sal');
    expect(payItemFor(home(), 'b')).toBeUndefined();
  });

  test('covers the UK payments until the day before the next pay day, less what is already there', () => {
    const p = sendPlan(home(), { person: 'a', payDay: '2026-11-25', rate: 20 })!;
    // whole weeks: Mon 23 Nov (pay day Wed 25th) to Sun 20 Dec (next pay day Fri 25 Dec is in the week of the 21st)
    expect(p.from).toBe('2026-11-23');
    expect(p.until).toBe('2026-12-20');
    // food on Mondays 23/11, 30/11, 7/12, 14/12 + rent 1/12
    expect(p.ukOut.map((o) => o.item.id).sort()).toEqual(['food', 'food', 'food', 'food', 'rent']);
    expect(p.ukTotal).toBe(1400);
    // £300 entered Fri 20/11; Monday 16/11's food is still on the list, so it still has to come out
    expect(p.startBal).toBe(200);
    expect(p.needGBP).toBe(1200);
    expect(p.sendZAR).toBe(24000);
    // salary − transfer − the loan; the card payment gets the rest
    expect(p.randTotal).toBe(5000);
    expect(p.cards.map((o) => o.item.id)).toEqual(['cards']);
    expect(p.leftForCards).toBe(100000 - 24000 - 5000);
    expect(p.otherIn.map((o) => o.item.id)).toEqual(['bonus']);
  });

  test('rounds the rand up to the next R100 and adds the cushion', () => {
    const p = sendPlan(home(), { person: 'a', payDay: '2026-11-25', rate: 23.37, cushion: 50 })!;
    expect(p.needGBP).toBe(1250);
    expect(p.sendZAR).toBe(29300); // 1250 × 23.37 = 29,212.50
    expect(p.sendGBP).toBeGreaterThanOrEqual(1250);
  });

  test('an overdrawn UK account is added to what has to be sent', () => {
    const s = home();
    s.balances.b1.amount = -500;
    const p = sendPlan(s, { person: 'a', payDay: '2026-11-25', rate: 20 })!;
    expect(p.startBal).toBe(-600);
    expect(p.needGBP).toBe(2000);
  });

  test('a payment still on the list counts whatever its day; removed, it is gone', () => {
    const s = home();
    // rent dated Tue 24/11 (before pay day), a bank figure entered Thu 26/11: the rent is still to pay
    s.items.rent2 = { ...s.items.rent, id: 'rent2', name: 'Late rent', amount: 700, schedule: { kind: 'once', dates: ['2026-11-24'] } };
    s.balances.b2 = { id: 'b2', account: 'uk', date: '2026-11-26', amount: 500, u: 1 };
    const p = sendPlan(s, { person: 'a', payDay: '2026-11-26', rate: 20 })!;
    expect(p.ukOut.map((o) => o.item.id)).toContain('rent2');
    expect(p.startBal).toBe(500);
    expect(p.ukTotal).toBe(2100);
    // he pays it and removes it from the list
    const s2 = { ...s, overrides: { ...s.overrides, 'rent2|2026-11-24': { id: 'rent2|2026-11-24', item: 'rent2', date: '2026-11-24', skip: true, u: 2 } } };
    expect(sendPlan(s2, { person: 'a', payDay: '2026-11-26', rate: 20 })!.ukTotal).toBe(1400);
  });

  test('a figure entered on pay day morning is the starting point', () => {
    const s = home();
    s.balances.b2 = { id: 'b2', account: 'uk', date: '2026-11-25', amount: 1500, u: 1 };
    const p = sendPlan(s, { person: 'a', payDay: '2026-11-25', rate: 20 })!;
    expect(p.startBal).toBe(1500);
    expect(p.sendZAR).toBe(0);
    expect(p.leftForCards).toBe(95000);
  });

  test('ticking a payment off after the transfer does not change the figure', () => {
    const s = home();
    s.overrides['rent|2026-12-01'] = { id: 'rent|2026-12-01', item: 'rent', date: '2026-12-01', u: 2, paid: { on: '2026-12-01', amount: 1000, by: 'a' } };
    expect(sendPlan(s, { person: 'a', payDay: '2026-11-25', rate: 20 })!.sendZAR).toBe(24000);
  });

  test('a salary moved to a later day moves the end of the month too', () => {
    const s = home();
    s.overrides['sal|2026-12-25'] = { id: 'sal|2026-12-25', item: 'sal', date: '2026-12-25', moveTo: '2026-12-28', u: 2 };
    expect(sendPlan(s, { person: 'a', payDay: '2026-11-25', rate: 20 })!.until).toBe('2026-12-27');
  });

  test('a line can be marked as a credit card, or not', () => {
    const s = home();
    expect(isCard(s.items.cards)).toBe(true);
    s.items.cards = { ...s.items.cards, card: false };
    s.items.loan = { ...s.items.loan, card: true };
    const p = sendPlan(s, { person: 'a', payDay: '2026-11-25', rate: 20 })!;
    expect(p.cards.map((o) => o.item.id)).toEqual(['loan']);
    expect(p.randTotal).toBe(30000);
  });

  test('which pay day: late and not ticked = today; ticked = that day; long after = the next', () => {
    const s = home();
    const sal = s.items.sal;
    expect(defaultPayDay(s, sal, '2026-11-27')).toBe('2026-11-27');
    expect(defaultPayDay(s, sal, '2026-11-24')).toBe('2026-11-25');
    s.overrides['sal|2026-11-25'] = { id: 'sal|2026-11-25', item: 'sal', date: '2026-11-25', u: 2, paid: { on: '2026-11-26', amount: 100000, by: 'a' } };
    expect(defaultPayDay(s, sal, '2026-11-28')).toBe('2026-11-26');
    expect(defaultPayDay(s, sal, '2026-12-10')).toBe('2026-12-25');
  });
});
