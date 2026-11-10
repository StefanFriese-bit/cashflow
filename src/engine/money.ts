import type { Currency } from './types';

const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zar0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const zar2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** £1,700 · £8.99 · −£145 */
export function money(v: number, currency: Currency = 'GBP', opts: { exact?: boolean; plus?: boolean } = {}): string {
  const abs = Math.abs(v);
  const exact = opts.exact ?? (abs < 100 && Math.round(abs * 100) % 100 !== 0);
  const body = currency === 'GBP' ? (exact ? gbp2 : gbp0).format(abs) : 'R' + (exact ? zar2 : zar0).format(abs);
  const neg = v < -0.004;
  return (neg ? '−' : opts.plus && v > 0.004 ? '+' : '') + body;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Reads "1,700", "£1700.50", "R 6 957,19" style input. */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[£R\s]/gi, '');
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? Math.abs(v) : null;
}
