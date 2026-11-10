// A made-up household for the tests (the real figures never go into this public code).
import { emptyState, type Item, type State } from '../src/engine/types';

export function fixture(u = 1): State {
  const s = emptyState(u);
  s.settings = { rate: 20, trackFrom: '2026-11-10', remindDays: 2, u };
  s.people.a = { id: 'a', name: 'Alex', tone: 'a', u };
  s.people.b = { id: 'b', name: 'Sam', tone: 'b', u };
  s.accounts.acc1 = { id: 'acc1', name: 'Bank One', owner: 'a', u };
  s.accounts.acc2 = { id: 'acc2', name: 'Bank Two', owner: 'b', u };
  const add = (i: Partial<Item> & Pick<Item, 'id' | 'name' | 'person' | 'amount' | 'schedule'>) => {
    s.items[i.id] = { u, account: i.person === 'a' ? 'acc1' : 'acc2', currency: 'GBP', kind: 'bill', group: 'House', dayConfirmed: true, remind: true, ...i } as Item;
  };
  add({ id: 'pay', name: 'Alex pay', person: 'a', kind: 'income', group: 'Income', amount: 3000, schedule: { kind: 'monthly', days: [25], start: '2026-11-01' }, remind: false });
  add({ id: 'pay2', name: 'Sam pay', person: 'b', kind: 'income', group: 'Income', amount: 2000, schedule: { kind: 'monthly', days: [25], start: '2026-11-01' }, remind: false });
  add({ id: 'rent', name: 'Rent', person: 'a', amount: 1200, schedule: { kind: 'monthly', days: [1], start: '2026-12-01' }, dayConfirmed: false });
  add({ id: 'ctax', name: 'Council tax', person: 'b', amount: 200, schedule: { kind: 'monthly', days: [1], start: '2026-12-01', skipMonths: [2, 3] } });
  add({ id: 'phone', name: 'Phone', person: 'b', amount: 10, schedule: { kind: 'monthly', days: [12, 31], start: '2026-11-01' }, group: 'Subscriptions', remind: false });
  add({ id: 'food', name: 'Food', person: 'a', kind: 'budget', group: 'Living', amount: 100, steps: [{ from: '2026-12-01', amount: 120 }], schedule: { kind: 'weekly', every: 1, start: '2026-11-09' }, remind: false });
  add({ id: 'gym', name: 'Gym', person: 'b', kind: 'budget', group: 'Living', amount: 30, schedule: { kind: 'weekly', every: 2, start: '2026-11-11' }, remind: false });
  add({ id: 'sa', name: 'Card in rand', person: 'a', currency: 'ZAR', group: 'SA payments', amount: 2000, schedule: { kind: 'once', dates: ['2026-11-11', '2026-12-11'] }, loan: 'l1' });
  add({ id: 'save', name: 'Holiday saving', person: 'a', kind: 'saving', group: 'Savings', amount: 100, schedule: { kind: 'monthly', days: [26], start: '2026-11-01', count: 3 }, goal: 'g1' });
  add({ id: 'mot', name: 'MOT', person: 'b', amount: 0, schedule: { kind: 'none' } });
  s.balances.b1 = { id: 'b1', account: 'acc1', date: '2026-11-01', amount: 500, u };
  s.balances.b2 = { id: 'b2', account: 'acc2', date: '2026-11-01', amount: 300, u };
  s.loans.l1 = { id: 'l1', name: 'Family', currency: 'ZAR', principal: 10000, u };
  s.repayments.r1 = { id: 'r1', loan: 'l1', date: '2026-01-01', amount: 6000, u };
  s.goals.g1 = { id: 'g1', name: 'Holiday', currency: 'GBP', target: 350, by: '2027-06-01', u };
  s.notes.n1 = { id: 'n1', title: 'Notes', body: 'Hello', u };
  return s;
}
