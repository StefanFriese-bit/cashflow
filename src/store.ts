import { useEffect, useReducer } from 'preact/hooks';
import { merge, sameContent, upgrade } from './engine/merge';
import type { Balance, CollectionName, Goal, Item, Loan, Note, Occ, Override, Repayment, Settings, State } from './engine/types';
import { emptyState } from './engine/types';
import { readFile, writeFile, SyncError, type Conn } from './sync/github';
import { todayUK } from './engine/dates';

const K_STATE = 'cashflow-state-v1';
const K_DIRTY = 'cashflow-dirty';
const K_CONN = 'cashflow-conn';
const K_ME = 'cashflow-me';
export const DATA_PATH = 'data.json';

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: keep going in memory */
  }
}

// ---------------- state ----------------

let state: State = (() => {
  const raw = lsGet(K_STATE);
  if (!raw) return emptyState(0);
  try {
    return upgrade(JSON.parse(raw));
  } catch {
    return emptyState(0);
  }
})();
let dirty = lsGet(K_DIRTY) === '1';
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}
function emit() {
  for (const l of listeners) l();
}
function save() {
  lsSet(K_STATE, JSON.stringify(state));
}

export function useStore(): State {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const force = () => bump(undefined as never);
  useEffect(() => {
    listeners.add(force);
    return () => void listeners.delete(force);
  }, []);
  return state;
}

/** Replace the whole plan (restore from a file, or first load). */
export function replaceState(s: State, markDirty = true) {
  state = s;
  save();
  if (markDirty) touch();
  else emit();
}

function touch() {
  dirty = true;
  lsSet(K_DIRTY, '1');
  emit();
  scheduleSync();
}

let clock = 0;
function now(): number {
  // strictly increasing, so two changes in the same millisecond still order
  const t = Date.now();
  clock = t > clock ? t : clock + 1;
  return clock;
}

function put<C extends CollectionName>(c: C, rec: State[C][string]) {
  state = { ...state, [c]: { ...state[c], [rec.id]: { ...rec, u: now() } } };
  save();
  touch();
}

// ---------------- who is using this device ----------------

export function me(): string | null {
  return lsGet(K_ME);
}
export function setMe(id: string) {
  lsSet(K_ME, id);
  emit();
}

// ---------------- actions ----------------

export function saveItem(item: Item) {
  put('items', item);
}
export function deleteItem(id: string) {
  const it = state.items[id];
  if (it) put('items', { ...it, del: true });
}
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Change one payment of a series. Passing undefined for a field removes that change. */
export function changeOne(occ: Pick<Occ, 'key' | 'item' | 'orig'>, patch: Partial<Pick<Override, 'moveTo' | 'amount' | 'skip' | 'paid'>>) {
  const cur = state.overrides[occ.key];
  const base: Override = cur && !cur.del ? { ...cur } : { id: occ.key, item: occ.item.id, date: occ.orig, u: 0 };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === false) delete (base as any)[k];
    else (base as any)[k] = v;
  }
  const empty = base.moveTo === undefined && base.amount === undefined && !base.skip && !base.paid;
  put('overrides', empty ? { ...base, del: true } : { ...base, del: undefined });
}

export function markPaid(occ: Occ, amount: number, on: string) {
  changeOne(occ, { paid: { on, amount, by: me() || '' } });
  if (occ.item.loan) {
    const id = `rep-${occ.key}`;
    put('repayments', { id, loan: occ.item.loan, date: on, amount, note: occ.item.name, u: 0 });
  }
}
export function unmarkPaid(occ: Occ) {
  changeOne(occ, { paid: undefined });
  const rep = state.repayments[`rep-${occ.key}`];
  if (rep) put('repayments', { ...rep, del: true });
}

export function saveBalance(b: Balance) {
  put('balances', b);
}
export function deleteBalance(id: string) {
  const b = state.balances[id];
  if (b) put('balances', { ...b, del: true });
}
export function saveLoan(l: Loan) {
  put('loans', l);
}
export function saveRepayment(r: Repayment) {
  put('repayments', r);
}
export function saveGoal(g: Goal) {
  put('goals', g);
}
export function saveNote(n: Note) {
  put('notes', n);
}
export function saveSettings(patch: Partial<Settings>) {
  state = { ...state, settings: { ...state.settings, ...patch, u: now() } };
  save();
  touch();
}

// ---------------- sync ----------------

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number }
  | { kind: 'offline'; at?: number }
  | { kind: 'error'; message: string; status?: number };

let status: SyncStatus = { kind: 'off' };
let sha: string | null = null;
const statusListeners = new Set<() => void>();
export function syncStatus(): SyncStatus {
  return status;
}
function setStatus(s: SyncStatus) {
  status = s;
  for (const l of statusListeners) l();
  emit();
}
export function useSyncStatus(): SyncStatus {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const force = () => bump(undefined as never);
  useEffect(() => {
    statusListeners.add(force);
    return () => void statusListeners.delete(force);
  }, []);
  return status;
}

export function getConn(): Conn | null {
  const raw = lsGet(K_CONN);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return c.token ? c : null;
  } catch {
    return null;
  }
}
export function setConn(c: Conn | null) {
  lsSet(K_CONN, c ? JSON.stringify(c) : null);
  sha = null;
  setStatus(c ? { kind: 'syncing' } : { kind: 'off' });
  if (c) void syncNow();
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(ms = 1200) {
  if (!getConn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

let running: Promise<void> | null = null;
let again = false;
export function syncNow(fetcher: typeof fetch = fetch): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce(fetcher);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(fetcher: typeof fetch) {
  const conn = getConn();
  if (!conn) return setStatus({ kind: 'off' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return setStatus({ kind: 'offline', at: status.kind === 'ok' ? status.at : undefined });
  setStatus({ kind: 'syncing' });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remoteFile = await readFile(conn, DATA_PATH, fetcher);
      const remote = remoteFile ? upgrade(JSON.parse(remoteFile.text)) : emptyState(0);
      sha = remoteFile?.sha ?? null;
      const mergedState = merge(state, remote);
      const localChanged = !sameContent(mergedState, state);
      if (localChanged) {
        state = mergedState;
        save();
        emit();
      }
      if (sameContent(mergedState, remote)) {
        dirty = false;
        lsSet(K_DIRTY, null);
        return setStatus({ kind: 'ok', at: Date.now() });
      }
      const who = state.people[me() || '']?.name || 'someone';
      const res = await writeFile(conn, DATA_PATH, JSON.stringify(mergedState, null, 1), sha, `Update by ${who} (${todayUK()})`, fetcher);
      if (res !== 'conflict') {
        sha = res;
        dirty = false;
        lsSet(K_DIRTY, null);
        return setStatus({ kind: 'ok', at: Date.now() });
      }
    }
    setStatus({ kind: 'error', message: 'Could not save after several tries — will try again shortly.' });
  } catch (e) {
    if (e instanceof SyncError) setStatus({ kind: 'error', message: e.message, status: e.status });
    else setStatus({ kind: 'offline', at: status.kind === 'ok' ? status.at : undefined });
  }
}

export function hasUnsaved(): boolean {
  return dirty;
}

/** Keep in step while the app is open: on start, when it comes back to the front, every 30 s, when back online. */
export function startSyncLoop() {
  if (typeof window === 'undefined') return;
  void syncNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.addEventListener('online', () => void syncNow());
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 30000);
}

// test hook
export function __resetForTests(s: State = emptyState(0)) {
  state = s;
  sha = null;
  dirty = false;
  status = { kind: 'off' };
}
