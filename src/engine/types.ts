// The whole household plan is one document of small records. Every record carries `u` (the time it
// was last changed, in ms) so two devices that changed different things can be merged record by record.

export type ISODate = string; // 'YYYY-MM-DD'
export type Currency = 'GBP' | 'ZAR';

export interface Rec {
  id: string;
  u: number;
  del?: boolean; // deleted records stay as markers so a deletion syncs too
}

export interface Person extends Rec {
  name: string;
  tone: 'a' | 'b'; // which of the two person colours
}

export interface Account extends Rec {
  name: string; // e.g. the bank
  owner: string; // person id
}

export type Schedule =
  // On these days of each month (31 = last day of a shorter month), optionally leaving some months out.
  | { kind: 'monthly'; days: number[]; start: ISODate; end?: ISODate; count?: number; skipMonths?: number[] }
  // Every N weeks, on the weekday of `start`.
  | { kind: 'weekly'; every: number; start: ISODate; end?: ISODate; count?: number }
  // Fixed dates.
  | { kind: 'once'; dates: ISODate[] }
  // Known cost, no date yet (e.g. road tax, MOT).
  | { kind: 'none' };

export interface Step {
  from: ISODate; // from this date on, the amount is…
  amount: number;
}

export type ItemKind =
  | 'income' // money in
  | 'bill' // a payment that goes out on a date (debit order, rent, a transfer you make)
  | 'saving' // money put aside
  | 'budget'; // spending allowance (food, petrol): counted, never "ticked off"

export interface Item extends Rec {
  name: string;
  person: string; // who pays / receives
  account: string; // which account it hits
  currency: Currency;
  kind: ItemKind;
  group: string; // section, as in the sheet
  amount: number; // always positive
  steps?: Step[];
  schedule: Schedule;
  dayConfirmed: boolean; // false = the sheet did not say which day; shown as "day not confirmed"
  remind: boolean;
  loan?: string; // repays this loan
  goal?: string; // saves towards this goal
  note?: string;
}

/** A change to ONE payment of a series, keyed by the item and the date the schedule gave it. */
export interface Override extends Rec {
  // id = `${item}|${date}`
  item: string;
  date: ISODate;
  moveTo?: ISODate;
  amount?: number;
  skip?: boolean;
  paid?: { on: ISODate; amount: number; by: string };
}

export interface Loan extends Rec {
  name: string;
  currency: Currency;
  principal: number;
  note?: string;
}

export interface Repayment extends Rec {
  loan: string;
  date: ISODate | ''; // '' = date not recorded
  amount: number;
  note?: string;
}

export interface Goal extends Rec {
  name: string;
  currency: Currency;
  target: number;
  by?: ISODate;
  start?: number; // already put aside before the app
  note?: string;
}

/** "On this date, before that day's payments, the account held …" */
export interface Balance extends Rec {
  account: string;
  date: ISODate;
  amount: number;
}

export interface Note extends Rec {
  title: string;
  body: string;
}

export interface Settings {
  rate: number; // rand per pound used for planning
  trackFrom: ISODate; // payments before this date are history: never "not ticked yet"
  remindDays: number; // how many days ahead a payment counts as "due soon"
  u: number;
}

export interface State {
  v: 1;
  people: Record<string, Person>;
  accounts: Record<string, Account>;
  items: Record<string, Item>;
  overrides: Record<string, Override>;
  loans: Record<string, Loan>;
  repayments: Record<string, Repayment>;
  goals: Record<string, Goal>;
  balances: Record<string, Balance>;
  notes: Record<string, Note>;
  settings: Settings;
}

export const COLLECTIONS = [
  'people',
  'accounts',
  'items',
  'overrides',
  'loans',
  'repayments',
  'goals',
  'balances',
  'notes',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** One dated payment produced from an item's schedule (after any change to that one payment). */
export interface Occ {
  key: string; // `${item}|${origDate}`
  item: Item;
  orig: ISODate; // date the schedule gave it
  date: ISODate; // date it actually counts (moved, or the day it was paid)
  amount: number; // in the item's currency, positive
  gbp: number; // signed: + money in, − money out
  paid?: Override['paid'];
  moved: boolean;
  changed: boolean; // amount differs from the plan for this one payment
}

export function emptyState(now = Date.now()): State {
  return {
    v: 1,
    people: {},
    accounts: {},
    items: {},
    overrides: {},
    loans: {},
    repayments: {},
    goals: {},
    balances: {},
    notes: {},
    settings: { rate: 22, trackFrom: '2026-11-10', remindDays: 2, u: now },
  };
}

export function live<T extends Rec>(m: Record<string, T>): T[] {
  return Object.values(m).filter((r) => !r.del);
}
