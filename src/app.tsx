import { useEffect, useState } from 'preact/hooks';
import { todayUK, nice } from './engine/dates';
import { money } from './engine/money';
import { dueSoon, notTicked } from './engine/plan';
import { live } from './engine/types';
import { pushState } from './push';
import { markPaid, me, setMe, useStore } from './store';
import { Icon } from './ui';
import { Compare } from './views/compare';
import { ItemEditor, OccSheet, findOcc, newItem } from './views/editors';
import { Loans } from './views/loans';
import { Payments, type PayFilter } from './views/payments';
import { Settings } from './views/settings';
import { Today } from './views/today';
import { Weeks } from './views/weeks';

export type Route = 'today' | 'weeks' | 'payments' | 'us' | 'loans' | 'settings';
export interface Nav {
  go: (r: Route, params?: Record<string, string>) => void;
  openOcc: (key: string) => void;
  openItem: (id: string) => void;
  newItem: (person?: string) => void;
}

function parseHash(): { route: Route; params: Record<string, string> } {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const route = (['today', 'weeks', 'payments', 'us', 'loans', 'settings'].includes(path) ? path : 'today') as Route;
  return { route, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return wide;
}

/** The app keeps track of the date by itself: at midnight (UK) everything moves on a day. */
function useToday() {
  const [today, setToday] = useState(todayUK());
  useEffect(() => {
    const t = setInterval(() => setToday(todayUK()), 30000);
    const v = () => document.visibilityState === 'visible' && setToday(todayUK());
    document.addEventListener('visibilitychange', v);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', v);
    };
  }, []);
  return today;
}

export function App() {
  const state = useStore();
  const today = useToday();
  const wide = useWide();
  const [{ route, params }, setLoc] = useState(parseHash());
  const [occKey, setOccKey] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof newItem> | null>(null);
  const [popup, setPopup] = useState(false);

  useEffect(() => {
    const f = () => setLoc(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => window.scrollTo(0, 0), [route]);

  const scope = pushState().scope;
  const meId = me();
  const mine = (p: string) => !meId || scope === 'all' || p === meId;
  const due = dueSoon(state, today).filter((o) => mine(o.item.person));
  const late = notTicked(state, today).filter((o) => o.item.remind);
  const badge = due.length + late.length;

  // the small pop-up when the app opens: once a day, again if something new comes due
  const popKey = `cashflow-popup-${today}`;
  const sig = due.map((o) => o.key).join(',');
  useEffect(() => {
    if (!due.length) return;
    let seen = '';
    try {
      seen = localStorage.getItem(popKey) || '';
    } catch {
      /* ignore */
    }
    if (seen !== sig) setPopup(true);
  }, [sig, popKey]);
  const closePopup = () => {
    setPopup(false);
    try {
      localStorage.setItem(popKey, sig);
    } catch {
      /* ignore */
    }
  };

  // the red number on the home-screen icon
  useEffect(() => {
    const n = navigator as any;
    if (n.setAppBadge) (badge ? n.setAppBadge(badge) : n.clearAppBadge?.())?.catch?.(() => {});
  }, [badge]);

  const nav: Nav = {
    go: (r, p) => {
      location.hash = `#/${r}${p ? '?' + new URLSearchParams(p).toString() : ''}`;
    },
    openOcc: (k) => setOccKey(k),
    openItem: (id) => {
      setOccKey(null);
      setItemId(id);
    },
    newItem: (person) => setDraft(newItem(state, person || meId || live(state.people)[0]?.id || '')),
  };

  const people = live(state.people);
  if (people.length && !meId && route !== 'settings') {
    return (
      <div class="app">
        <main class="main" style={{ maxWidth: '480px', paddingTop: 'calc(env(safe-area-inset-top) + 70px)' }}>
          <h1 class="title">Who is this?</h1>
          <p class="subtitle">So the app greets the right person and sends the right reminders. You can change it later in Settings.</p>
          {people.map((p) => (
            <button class={`acct ${p.tone}`} style={{ width: '100%', marginBottom: '12px', textAlign: 'left', fontSize: '22px', fontFamily: 'var(--display)', fontWeight: 600 }} onClick={() => setMe(p.id)}>
              {p.name}
            </button>
          ))}
        </main>
      </div>
    );
  }

  const tabs: { r: Route; label: string; icon: string; dot?: number }[] = [
    { r: 'today', label: 'Today', icon: 'today', dot: badge },
    { r: 'weeks', label: 'Weeks', icon: 'weeks' },
    { r: 'payments', label: 'Payments', icon: 'list', dot: live(state.items).filter((i) => !i.dayConfirmed && i.schedule.kind !== 'none').length || undefined },
    { r: 'us', label: people.length === 2 ? `${people[0].name} & ${people[1].name}` : 'Us', icon: 'us' },
    { r: 'loans', label: 'Loans', icon: 'loans' },
  ];
  const wideRoute = route === 'weeks' && wide;

  return (
    <div class="app">
      <nav class="nav" aria-label="Main">
        <div class="brand">
          Cash flow
          <small>{people.map((p) => p.name).join(' & ') || 'Household'}</small>
        </div>
        {tabs.map((t) => (
          <a href={`#/${t.r}`} class={route === t.r ? 'on' : ''} aria-current={route === t.r ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{wide ? t.label : t.r === 'us' ? 'Us' : t.label}</span>
            {!!t.dot && <span class="dot" aria-label={`${t.dot} to look at`}>{t.dot}</span>}
          </a>
        ))}
        {wide && (
          <>
            <div class="spacer" />
            <a href="#/settings" class={route === 'settings' ? 'on' : ''}>
              <Icon name="settings" />
              <span>Settings</span>
            </a>
          </>
        )}
      </nav>
      <main class={`main ${wideRoute ? 'wide' : ''}`}>
        {route === 'today' && <Today state={state} today={today} nav={nav} />}
        {route === 'weeks' && <Weeks state={state} today={today} nav={nav} wide={wide} />}
        {route === 'payments' && <Payments key={params.filter || 'all'} state={state} nav={nav} initialFilter={params.filter as PayFilter} />}
        {route === 'us' && <Compare state={state} today={today} nav={nav} />}
        {route === 'loans' && <Loans state={state} today={today} nav={nav} />}
        {route === 'settings' && <Settings state={state} />}
      </main>

      {occKey && <OccSheet key={occKey} state={state} occKey={occKey} onClose={() => setOccKey(null)} onEditItem={nav.openItem} />}
      {itemId && state.items[itemId] && <ItemEditor key={itemId} state={state} item={state.items[itemId]} onClose={() => setItemId(null)} />}
      {draft && <ItemEditor key={draft.id} state={state} item={draft} onClose={() => setDraft(null)} />}

      {popup && due.length > 0 && (
        <div class="toast" role="alertdialog" aria-label="Payments due soon">
          <div class="t-head">
            <div class="bell">
              <Icon name="bell" />
            </div>
            <div class="t-title">
              {due.length === 1 ? '1 payment due' : `${due.length} payments due`} in the next {state.settings.remindDays} days
            </div>
            <button class="iconbtn" style={{ width: '34px', height: '34px' }} aria-label="Close" onClick={closePopup}>
              <Icon name="close" />
            </button>
          </div>
          {due.slice(0, 5).map((o) => (
            <div class="t-row">
              <span class={`pdot ${state.people[o.item.person]?.tone || ''}`} />
              <button style={{ flex: 1, border: '0px', background: 'none', padding: '0px', textAlign: 'left', minWidth: '0px' }} onClick={() => { closePopup(); setOccKey(o.key); }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.item.name}</div>
                <div class="muted small">
                  {o.date === today ? 'Today' : nice(o.date)} · {money(o.amount, o.item.currency)}
                </div>
              </button>
              <button class="btn small good" onClick={() => markPaid(findOcc(state, o.key) || o, o.amount, o.date <= today ? o.date : today)}>
                <Icon name="check" /> Paid
              </button>
            </div>
          ))}
          {due.length > 5 && <div class="muted small" style={{ paddingTop: '6px' }}>and {due.length - 5} more on the Today page</div>}
          <button class="btn block small" style={{ marginTop: '8px' }} onClick={closePopup}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}

