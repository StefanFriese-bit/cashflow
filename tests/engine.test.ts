import { describe, expect, test } from 'vitest';
import { addDays, todayUK, weekStart } from '../src/engine/dates';
import { merge, sameContent } from '../src/engine/merge';
import { parseAmount, money } from '../src/engine/money';
import { balanceAt, dueSoon, goalStatus, loanStatus, monthSummary, notTicked, occurrences, scheduleDates, scheduleText, weeks, lowestPoint } from '../src/engine/plan';
import { morningMessage } from '../src/engine/remind';
import { fixture } from './fixture';

describe('schedules', () => {
  test('monthly on the 31st falls on the last day of shorter months', () => {
    expect(scheduleDates({ kind: 'monthly', days: [31], start: '2027-01-01' }, '2027-01-01', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });
  test('months left out are left out (no council tax in Feb and Mar)', () => {
    const d = scheduleDates({ kind: 'monthly', days: [1], start: '2026-12-01', skipMonths: [2, 3] }, '2026-12-01', '2027-05-31');
    expect(d).toEqual(['2026-12-01', '2027-01-01', '2027-04-01', '2027-05-01']);
  });
  test('a count stops the series, counted from its start', () => {
    const s = { kind: 'monthly' as const, days: [26], start: '2026-11-01', count: 3 };
    expect(scheduleDates(s, '2026-12-01', '2027-12-31')).toEqual(['2026-12-26', '2027-01-26']);
  });
  test('several days a month', () => {
    expect(scheduleDates({ kind: 'monthly', days: [2, 21, 28], start: '2026-11-01' }, '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-21', '2026-11-28']);
  });
  test('every 4 weeks keeps the weekday and does not drift', () => {
    const d = scheduleDates({ kind: 'weekly', every: 4, start: '2026-11-23' }, '2027-01-01', '2027-03-01');
    expect(d).toEqual(['2027-01-18', '2027-02-15']);
  });
  test('readable text', () => {
    expect(scheduleText({ kind: 'monthly', days: [1], start: '2026-12-01', skipMonths: [2, 3] })).toBe('1st of every month, not in Feb or Mar');
    expect(scheduleText({ kind: 'monthly', days: [2, 21, 31], start: '2026-12-01' })).toBe('2nd, 21st and last day of every month');
    expect(scheduleText({ kind: 'weekly', every: 2, start: '2026-11-11' })).toBe('Every 2 weeks (Wed)');
  });
});

describe('one-off changes', () => {
  test('moving, changing the amount, skipping and paying one payment', () => {
    const s = fixture();
    s.overrides['rent|2027-01-01'] = { id: 'rent|2027-01-01', item: 'rent', date: '2027-01-01', moveTo: '2026-12-30', u: 2 };
    s.overrides['rent|2027-02-01'] = { id: 'rent|2027-02-01', item: 'rent', date: '2027-02-01', amount: 1300, u: 2 };
    s.overrides['rent|2027-03-01'] = { id: 'rent|2027-03-01', item: 'rent', date: '2027-03-01', skip: true, u: 2 };
    s.overrides['rent|2027-04-01'] = { id: 'rent|2027-04-01', item: 'rent', date: '2027-04-01', paid: { on: '2027-03-29', amount: 1250, by: 'a' }, u: 2 };
    const rent = occurrences(s, '2026-12-01', '2027-04-30').filter((o) => o.item.id === 'rent');
    expect(rent.map((o) => [o.date, o.amount])).toEqual([
      ['2026-12-01', 1200],
      ['2026-12-30', 1200],
      ['2027-02-01', 1300],
      ['2027-03-29', 1250],
    ]);
    expect(rent[1].moved).toBe(true);
    expect(rent[2].changed).toBe(true);
    expect(rent[3].paid?.by).toBe('a');
    // a skipped one can still be found to bring it back
    expect(occurrences(s, '2027-03-01', '2027-03-01', { includeSkipped: true }).some((o) => o.key === 'rent|2027-03-01')).toBe(true);
  });
  test('a ticked-off payment stays when the series day is changed afterwards', () => {
    const s = fixture();
    s.overrides['rent|2026-12-01'] = { id: 'rent|2026-12-01', item: 'rent', date: '2026-12-01', paid: { on: '2026-12-01', amount: 1200, by: 'a' }, u: 2 };
    s.items.rent = { ...s.items.rent, schedule: { kind: 'monthly', days: [3], start: '2026-12-01' } };
    const dec = occurrences(s, '2026-12-01', '2026-12-31').filter((o) => o.item.id === 'rent');
    expect(dec.map((o) => o.date)).toEqual(['2026-12-01', '2026-12-03']);
  });
  test('amount changes from a date', () => {
    const s = fixture();
    const food = occurrences(s, '2026-11-23', '2026-12-08').filter((o) => o.item.id === 'food');
    // 23 Nov and 30 Nov are before the change on 1 Dec
    expect(food.map((o) => o.amount)).toEqual([100, 100, 120]);
  });
});

describe('balances', () => {
  test('rand payments come off at the plan rate', () => {
    const s = fixture();
    // 1 Nov £500 → 9 Nov food −100 → 11 Nov R2,000 at R20 = −£100
    expect(balanceAt(s, 'acc1', '2026-11-08')).toBe(500);
    expect(balanceAt(s, 'acc1', '2026-11-11')).toBe(300);
  });
  test('a newer balance you type in wins over the plan', () => {
    const s = fixture();
    s.balances.b3 = { id: 'b3', account: 'acc1', date: '2026-11-11', amount: 1000, u: 2 };
    // the R2,000 on the 11th counts after the balance entered "at the start of" the 11th
    expect(balanceAt(s, 'acc1', '2026-11-11')).toBe(900);
  });
  test('weeks run Monday to Sunday with matching open and close', () => {
    const s = fixture();
    const w = weeks(s, '2026-11-10', 6);
    expect(w[0].start).toBe('2026-11-09');
    for (let i = 1; i < w.length; i++) expect(w[i].open.acc1).toBeCloseTo(w[i - 1].close.acc1, 6);
    expect(w[0].open.acc1).toBe(500);
  });
  test('lowest point', () => {
    const s = fixture();
    const lo = lowestPoint(s, 'acc1', '2026-11-10', '2026-12-31');
    expect(lo.bal).toBeLessThan(500);
  });
});

describe('reminders', () => {
  test('due soon: unpaid bills within the window, not budgets or income', () => {
    const s = fixture();
    const d = dueSoon(s, '2026-11-29');
    expect(d.map((o) => o.item.id)).toEqual(['phone', 'rent', 'ctax'].filter((id) => s.items[id].remind));
    expect(d.every((o) => o.item.kind === 'bill' || o.item.kind === 'saving')).toBe(true);
  });
  test('not ticked: only from the day the app took over, and paid ones drop off', () => {
    const s = fixture();
    const late = notTicked(s, '2026-11-13');
    expect(late.map((o) => o.key)).toEqual(['sa|2026-11-11', 'phone|2026-11-12']);
    // the app never changes a plan in place: every change makes a new plan object
    const s2 = { ...s, overrides: { ...s.overrides, 'sa|2026-11-11': { id: 'sa|2026-11-11', item: 'sa', date: '2026-11-11', paid: { on: '2026-11-11', amount: 2000, by: 'a' }, u: 3 } } };
    expect(notTicked(s2, '2026-11-13').map((o) => o.key)).toEqual(['phone|2026-11-12']);
  });
  test('the morning notice, per person', () => {
    const s = fixture();
    const forA = morningMessage(s, '2026-11-30', { person: 'a', scope: 'mine' });
    expect(forA?.title).toBe('Rent due tomorrow');
    expect(forA?.body).toContain('Tomorrow · Rent £1,200');
    const forB = morningMessage(s, '2026-11-30', { person: 'b', scope: 'mine' });
    expect(forB?.title).toBe('Council tax due tomorrow');
    const all = morningMessage(s, '2026-11-30', { person: 'b', scope: 'all' });
    expect(all?.title).toBe('2 payments due soon · £1,400');
    expect(morningMessage(s, '2026-11-20', { person: 'b', scope: 'mine' })).toBeNull();
  });
});

describe('loans, goals, months', () => {
  test('a loan clears on the planned repayment that covers it', () => {
    const s = fixture();
    const l = loanStatus(s, 'l1', '2026-11-10');
    expect(l.remaining).toBe(4000);
    expect(l.clearOn).toBe('2026-12-11');
  });
  test('goal: saved, planned and short', () => {
    const s = fixture();
    const g = goalStatus(s, 'g1', '2026-11-10');
    expect(g.saved).toBe(0);
    expect(g.planned).toBe(300);
    expect(g.short).toBe(50);
  });
  test('month summary per person', () => {
    const m = monthSummary(fixture(), '2026-12-01');
    expect(m.a.income).toBe(3000);
    expect(m.b.byGroup.House).toBe(200);
  });
});

describe('merging two devices', () => {
  test('different changes on two devices both survive', () => {
    const base = fixture();
    const phone = structuredClone(base);
    const mac = structuredClone(base);
    phone.overrides['rent|2026-12-01'] = { id: 'rent|2026-12-01', item: 'rent', date: '2026-12-01', paid: { on: '2026-12-01', amount: 1200, by: 'b' }, u: 10 };
    mac.items.ctax = { ...mac.items.ctax, amount: 210, u: 11 };
    const m1 = merge(phone, mac);
    const m2 = merge(mac, phone);
    expect(sameContent(m1, m2)).toBe(true);
    expect(m1.items.ctax.amount).toBe(210);
    expect(m1.overrides['rent|2026-12-01'].paid?.by).toBe('b');
  });
  test('the newer change to the same payment wins; a deletion travels', () => {
    const a = fixture();
    const b = structuredClone(a);
    a.items.rent = { ...a.items.rent, amount: 1250, u: 20 };
    b.items.rent = { ...b.items.rent, amount: 1300, u: 21 };
    b.items.phone = { ...b.items.phone, del: true, u: 22 };
    const m = merge(a, b);
    expect(m.items.rent.amount).toBe(1300);
    expect(m.items.phone.del).toBe(true);
    expect(occurrences(m, '2026-11-01', '2026-12-31').some((o) => o.item.id === 'phone')).toBe(false);
  });
});

describe('money and dates', () => {
  test('amounts typed in different ways', () => {
    expect(parseAmount('1,700')).toBe(1700);
    expect(parseAmount('£8.99')).toBe(8.99);
    expect(parseAmount('R 6 957,19')).toBe(6957.19);
    expect(parseAmount('60.343,25')).toBe(60343.25);
    expect(parseAmount('abc')).toBeNull();
  });
  test('formatting', () => {
    expect(money(-1700)).toBe('−£1,700');
    expect(money(8.99)).toBe('£8.99');
    expect(money(135000, 'ZAR')).toBe('R135,000');
  });
  test('UK date, whatever the device clock zone', () => {
    // 23:30 UTC on 31 Mar 2027 is already 1 April in the UK (summer time)
    expect(todayUK(new Date('2027-03-31T23:30:00Z'))).toBe('2027-04-01');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
