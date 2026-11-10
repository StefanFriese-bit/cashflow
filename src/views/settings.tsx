import { useState } from 'preact/hooks';
import { todayUK } from '../engine/dates';
import { upgrade } from '../engine/merge';
import { occurrences } from '../engine/plan';
import type { State } from '../engine/types';
import { live } from '../engine/types';
import { disablePush, enablePush, isHomeScreenApp, isIOS, pushState, pushSupported, testNotification } from '../push';
import { getConn, me, replaceState, saveSettings, setConn, setMe, syncNow, useSyncStatus } from '../store';
import { merge } from '../engine/merge';
import { Banner, Field, Icon, Seg, Switch } from '../ui';

const OWNER = 'StefanFriese-bit';
const REPO = 'cashflow-data';

export function SyncLine() {
  const st = useSyncStatus();
  const text =
    st.kind === 'off'
      ? 'Not connected — only on this device'
      : st.kind === 'syncing'
        ? 'Saving…'
        : st.kind === 'ok'
          ? 'Saved — in step with every device'
          : st.kind === 'offline'
            ? 'Offline — saves when back online'
            : st.message;
  return (
    <button class={`syncdot ${st.kind}`} onClick={() => void syncNow()} title="Tap to sync now">
      <i /> {text}
    </button>
  );
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function csv(state: State): string {
  const today = todayUK();
  const occs = occurrences(state, state.settings.trackFrom, `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`, { includeSkipped: false });
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Date', 'Payment', 'Who', 'Account', 'Section', 'Kind', 'Amount', 'Currency', 'In pounds', 'Paid on', 'Paid amount'].map(q).join(',')];
  for (const o of occs)
    lines.push(
      [o.date, o.item.name, state.people[o.item.person]?.name || '', state.accounts[o.item.account]?.name || '', o.item.group, o.item.kind, o.amount.toFixed(2), o.item.currency, o.gbp.toFixed(2), o.paid?.on || '', o.paid ? o.paid.amount.toFixed(2) : '']
        .map(q)
        .join(','),
    );
  return lines.join('\n');
}

export function Settings({ state }: { state: State }) {
  const conn = getConn();
  const st = useSyncStatus();
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState(conn?.owner || OWNER);
  const [repo, setRepo] = useState(conn?.repo || REPO);
  const [push, setPush] = useState(pushState());
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('cashflow-theme') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const people = live(state.people);
  const meId = me();

  return (
    <div>
      <h1 class="title">Settings</h1>
      <p class="subtitle">
        <SyncLine />
      </p>

      <div class="cols">
        <div>
          <h2 class="section">Who is using this device</h2>
          <div class="card">
            <Seg full value={meId || ''} onChange={(v) => setMe(v)} options={people.map((p) => ({ v: p.id, label: <><span class={`pdot ${p.tone}`} />{p.name}</> }))} />
            <p class="muted small" style={{ marginBottom: '0px' }}>Used for the greeting, for “ticked off by”, and for which reminders this device gets.</p>
          </div>

          <h2 class="section">Sync between devices</h2>
          <div class="card">
            {conn ? (
              <>
                <div class="kv">
                  <span>Private store</span>
                  <b>
                    {conn.owner}/{conn.repo}
                  </b>
                </div>
                <div class="kv">
                  <span>Status</span>
                  <b>{st.kind === 'ok' ? 'In step' : st.kind === 'error' ? 'Problem' : st.kind}</b>
                </div>
                {st.kind === 'error' && <Banner kind="bad" icon="alert">{st.message}</Banner>}
                <div class="row-btns" style={{ marginTop: '8px' }}>
                  <button class="btn small" onClick={() => void syncNow()}>
                    <Icon name="sync" /> Sync now
                  </button>
                  <button class="btn small danger" onClick={() => setConn(null)}>
                    Disconnect this device
                  </button>
                </div>
                <p class="muted small">Every change is saved as a new version in the private store, so nothing is ever lost — older versions can be brought back.</p>
              </>
            ) : (
              <>
                <p class="small" style={{ marginTop: '0px' }}>
                  Paste the access key once on each device (each phone and the laptop). The plan then stays the same everywhere.
                </p>
                <Field label="Access key">
                  <input class="input" type="password" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder="github_pat_…" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value.trim())} />
                </Field>
                <details>
                  <summary class="small muted">Store name</summary>
                  <div class="grid2" style={{ marginTop: '8px' }}>
                    <Field label="Account">
                      <input class="input" value={owner} onInput={(e) => setOwner((e.target as HTMLInputElement).value.trim())} />
                    </Field>
                    <Field label="Store">
                      <input class="input" value={repo} onInput={(e) => setRepo((e.target as HTMLInputElement).value.trim())} />
                    </Field>
                  </div>
                </details>
                <button class="btn primary block" style={{ marginTop: '8px' }} disabled={!token || !owner || !repo} onClick={() => setConn({ owner, repo, token })}>
                  Connect
                </button>
              </>
            )}
          </div>

          <h2 class="section">Notifications</h2>
          <div class="card">
            {!pushSupported() || (isIOS() && !isHomeScreenApp()) ? (
              <Banner kind="info" icon="bell">
                {isIOS() ? (
                  <>
                    <b>First add the app to your home screen:</b> in Safari tap Share <span aria-hidden="true">⎋</span> → <b>Add to Home Screen</b>, then open it from the new icon and come back here. iPhone only allows notifications for home-screen apps.
                  </>
                ) : (
                  'This browser cannot show notifications.'
                )}
              </Banner>
            ) : (
              <>
                <Switch
                  label="Morning reminders on this device"
                  sub={`About 8:00 UK time, when a payment is due in the next ${state.settings.remindDays} days.`}
                  checked={push.on}
                  onChange={async (v) => {
                    setBusy(true);
                    setPushMsg(null);
                    const err = v ? await enablePush(push.scope) : await disablePush();
                    setBusy(false);
                    if (err) setPushMsg(err);
                    setPush(pushState());
                  }}
                />
                <Field group label="Remind me about">
                  <Seg
                    full
                    value={push.scope}
                    onChange={async (v) => {
                      setPush({ ...push, scope: v });
                      if (push.on) {
                        const err = await enablePush(v);
                        if (err) setPushMsg(err);
                        setPush(pushState());
                      }
                    }}
                    options={[
                      { v: 'mine', label: 'My payments' },
                      { v: 'all', label: 'Everyone’s' },
                    ]}
                  />
                </Field>
                {busy && <p class="muted small">Working…</p>}
                {pushMsg && <Banner kind="bad" icon="alert">{pushMsg}</Banner>}
                {push.on && (
                  <button class="btn small" onClick={() => void testNotification()}>
                    <Icon name="bell" /> Send a test notification
                  </button>
                )}
              </>
            )}
            <hr class="sep" />
            <Field group label="Days ahead that count as “due soon”">
              <Seg full value={String(state.settings.remindDays)} onChange={(v) => saveSettings({ remindDays: Number(v) })} options={['1', '2', '3', '5', '7'].map((v) => ({ v, label: v }))} />
            </Field>
            <p class="muted small" style={{ margin: '0px' }}>Which payments remind you is set on each payment (the “Remind us” switch).</p>
          </div>
        </div>

        <div>
          <h2 class="section">Money</h2>
          <div class="card">
            <Field label="Rand to the pound used in the plan" hint="All rand payments are turned into pounds at this rate.">
              <input class="input" inputMode="decimal" value={String(state.settings.rate)} onChange={(e) => {
                const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
                if (v > 1 && v < 100) saveSettings({ rate: v });
              }} />
            </Field>
            <Field label="Ticking off starts from" hint="Payments before this date count as done and never show as “not ticked off yet”.">
              <input class="input" type="date" value={state.settings.trackFrom} onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                if (v) saveSettings({ trackFrom: v });
              }} />
            </Field>
          </div>

          <h2 class="section">Look</h2>
          <div class="card">
            <Seg
              full
              value={theme}
              onChange={(v) => {
                setTheme(v);
                try {
                  localStorage.setItem('cashflow-theme', v);
                } catch {
                  /* ignore */
                }
                if (v === 'auto') document.documentElement.removeAttribute('data-theme');
                else document.documentElement.setAttribute('data-theme', v);
              }}
              options={[
                { v: 'auto', label: 'Like the phone' },
                { v: 'light', label: 'Light' },
                { v: 'dark', label: 'Dark' },
              ]}
            />
          </div>

          <h2 class="section">Copies</h2>
          <div class="card">
            <div class="row-btns">
              <button class="btn small" onClick={() => download(`cash-flow-${todayUK()}.csv`, csv(state), 'text/csv')}>
                <Icon name="download" /> Excel list (CSV)
              </button>
              <button class="btn small" onClick={() => download(`cash-flow-backup-${todayUK()}.json`, JSON.stringify(state, null, 1), 'application/json')}>
                <Icon name="download" /> Full backup
              </button>
              <label class="btn small">
                <Icon name="upload" /> Load a backup
                <input
                  type="file"
                  accept="application/json,.json"
                  class="visually-hidden"
                  onChange={async (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    try {
                      const incoming = upgrade(JSON.parse(await f.text()));
                      if (!Object.keys(incoming.items).length) throw new Error('no payments in it');
                      replaceState(merge(state, incoming));
                      setRestoreMsg(`Loaded ${Object.keys(incoming.items).length} payments from ${f.name}.`);
                    } catch (err) {
                      setRestoreMsg(`That file could not be read (${(err as Error).message}).`);
                    }
                  }}
                />
              </label>
            </div>
            {restoreMsg && <p class="small">{restoreMsg}</p>}
            <p class="muted small" style={{ marginBottom: '0px' }}>The Excel list has every dated payment from {state.settings.trackFrom} for a year.</p>
          </div>
          <p class="muted small" style={{ textAlign: 'center' }}>Cash flow · version {__BUILD_DATE__}</p>
        </div>
      </div>
    </div>
  );
}
