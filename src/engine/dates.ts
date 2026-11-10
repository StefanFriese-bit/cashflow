import type { ISODate } from './types';

const DAY = 86400000;

export function parse(d: ISODate): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function fmt(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}
export function addDays(d: ISODate, n: number): ISODate {
  return fmt(parse(d) + n * DAY);
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(a) - parse(b)) / DAY);
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
}
export function ymd(d: ISODate): [number, number, number] {
  const [y, m, dd] = d.split('-').map(Number);
  return [y, m, dd];
}
export function iso(y: number, m: number, d: number): ISODate {
  return fmt(Date.UTC(y, m - 1, d));
}
/** 1 = Monday … 7 = Sunday */
export function weekday(d: ISODate): number {
  const w = new Date(parse(d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function weekStart(d: ISODate): ISODate {
  return addDays(d, 1 - weekday(d));
}
export function monthStart(d: ISODate): ISODate {
  const [y, m] = ymd(d);
  return iso(y, m, 1);
}
export function monthEnd(d: ISODate): ISODate {
  const [y, m] = ymd(d);
  return iso(y, m, daysInMonth(y, m));
}
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, dd] = ymd(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(dd, daysInMonth(ny, nm)));
}

/** Today's date in the UK, whatever the device's own clock zone. */
export function todayUK(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthName(m: number, long = false): string {
  return (long ? MONTHS_LONG : MONTHS)[m - 1];
}
export function dayName(d: ISODate): string {
  return DAYS[weekday(d) - 1];
}
/** "Tue 10 Nov" */
export function nice(d: ISODate, withYear = false): string {
  const [y, m, dd] = ymd(d);
  return `${dayName(d)} ${dd} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
/** "10 Nov 2026" */
export function short(d: ISODate, withYear = true): string {
  const [y, m, dd] = ymd(d);
  return `${dd} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
/** "9–15 Nov" */
export function weekLabel(start: ISODate): string {
  const end = addDays(start, 6);
  const [, m1, d1] = ymd(start);
  const [, m2, d2] = ymd(end);
  return m1 === m2 ? `${d1}–${d2} ${MONTHS[m2 - 1]}` : `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]}`;
}
/** "today", "tomorrow", "in 3 days", "yesterday", "4 days ago" */
export function relative(d: ISODate, today: ISODate): string {
  const n = diffDays(d, today);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return `in ${n} days`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  return short(d, ymd(d)[0] !== ymd(today)[0]);
}
export function ordinal(n: number): string {
  if (n === 31) return 'last day';
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${s}`;
}
