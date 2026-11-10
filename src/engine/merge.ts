import { COLLECTIONS, emptyState, type State } from './types';

/**
 * Two copies of the plan → one. Record by record, the newer change wins; a record only one side has is kept.
 * So one person ticking off the rent on a phone and the other changing a date on the laptop at the same time both survive.
 */
export function merge(a: State, b: State): State {
  const out = emptyState();
  for (const c of COLLECTIONS) {
    const ma = (a[c] || {}) as Record<string, { u: number }>;
    const mb = (b[c] || {}) as Record<string, { u: number }>;
    const m: Record<string, { u: number }> = { ...ma };
    for (const [id, rb] of Object.entries(mb)) {
      const ra = m[id];
      if (!ra || (rb.u || 0) > (ra.u || 0)) m[id] = rb;
    }
    (out as any)[c] = m;
  }
  out.settings = (b.settings?.u || 0) > (a.settings?.u || 0) ? b.settings : a.settings;
  return out;
}

/** True when b holds nothing that a lacks (so a does not need to take anything from b). */
export function sameContent(a: State, b: State): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

export function normalise(s: State): State {
  const out = emptyState();
  for (const c of COLLECTIONS) {
    const m = (s[c] || {}) as Record<string, unknown>;
    (out as any)[c] = Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]));
  }
  out.settings = s.settings;
  return out;
}

/** Make an incoming document safe to use: missing collections become empty. */
export function upgrade(raw: any): State {
  const s = emptyState(0);
  if (!raw || typeof raw !== 'object') return s;
  for (const c of COLLECTIONS) if (raw[c] && typeof raw[c] === 'object') (s as any)[c] = raw[c];
  if (raw.settings) s.settings = { ...s.settings, ...raw.settings };
  return s;
}
