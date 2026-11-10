import { beforeEach, describe, expect, test } from 'vitest';
import { b64decode, b64encode } from '../src/sync/github';
import { fixture } from './fixture';

// a tiny stand-in for GitHub's file API: one repo, files with a version (sha)
function fakeGitHub() {
  const files = new Map<string, { text: string; sha: string }>();
  let n = 0;
  const log: string[] = [];
  let interfere: (() => void) | null = null;
  const fetcher = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/?/, '').replace(/^contents\//, '');
    const method = init?.method || 'GET';
    log.push(`${method} ${path}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (path === '') return json(200, { private: true });
    if (method === 'GET') {
      const f = files.get(path);
      return f ? json(200, { content: b64encode(f.text), sha: f.sha }) : json(404, {});
    }
    if (method === 'PUT') {
      if (interfere) {
        const i = interfere;
        interfere = null;
        i();
      }
      const body = JSON.parse(String(init!.body));
      const cur = files.get(path);
      if ((cur?.sha || null) !== (body.sha || null)) return json(409, { message: 'conflict' });
      const sha = `s${++n}`;
      files.set(path, { text: b64decode(body.content), sha });
      return json(200, { content: { sha } });
    }
    return json(405, {});
  }) as unknown as typeof fetch;
  return {
    files,
    log,
    fetcher,
    put(path: string, text: string) {
      files.set(path, { text, sha: `s${++n}` });
    },
    onNextPut(f: () => void) {
      interfere = f;
    },
  };
}

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

describe('sync with the private store', () => {
  beforeEach(() => mem.clear());

  test('text with £ and – survives the round trip', () => {
    expect(b64decode(b64encode('Rent – £1,700 · Katie’s'))).toBe('Rent – £1,700 · Katie’s');
  });

  test('a new device loads the plan; a change is saved; someone else saving in between is merged, not lost', async () => {
    const gh = fakeGitHub();
    const remote = fixture(5);
    gh.put('data.json', JSON.stringify(remote));
    const store = await import('../src/store');
    store.__resetForTests();
    localStorage.setItem('cashflow-conn', JSON.stringify({ owner: 'o', repo: 'r', token: 't' }));

    await store.syncNow(gh.fetcher);
    expect(store.getState().items.rent.amount).toBe(1200);
    expect(store.syncStatus().kind).toBe('ok');
    expect(gh.log.filter((l) => l.startsWith('PUT'))).toHaveLength(0); // nothing new to save

    // this device changes the rent; meanwhile the other phone ticks off council tax and saves first
    store.saveItem({ ...store.getState().items.rent, amount: 1250 });
    gh.onNextPut(() => {
      const other = JSON.parse(gh.files.get('data.json')!.text);
      other.overrides['ctax|2026-12-01'] = { id: 'ctax|2026-12-01', item: 'ctax', date: '2026-12-01', paid: { on: '2026-12-01', amount: 200, by: 'b' }, u: Date.now() + 5 };
      gh.put('data.json', JSON.stringify(other));
    });
    await store.syncNow(gh.fetcher);
    const saved = JSON.parse(gh.files.get('data.json')!.text);
    expect(saved.items.rent.amount).toBe(1250);
    expect(saved.overrides['ctax|2026-12-01'].paid.by).toBe('b');
    expect(store.getState().overrides['ctax|2026-12-01'].paid?.by).toBe('b');
    expect(gh.log.filter((l) => l.startsWith('PUT')).length).toBe(2); // first try refused, second saved
    expect(store.hasUnsaved()).toBe(false);
  });

  test('a refused key is reported in plain words', async () => {
    const store = await import('../src/store');
    store.__resetForTests();
    localStorage.setItem('cashflow-conn', JSON.stringify({ owner: 'o', repo: 'r', token: 'bad' }));
    const f = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await store.syncNow(f);
    const st = store.syncStatus();
    expect(st.kind).toBe('error');
    expect(st.kind === 'error' && st.message).toMatch(/refused/);
  });
});
