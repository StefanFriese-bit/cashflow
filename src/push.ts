// Phone notifications. The device asks permission, gets an address from Apple/Google to send to, and leaves that
// address in the private store (push/<device>.json). Every morning a small job in the private store reads the plan
// and sends a notice to each address about payments due in the next days.
import { getConn, getState, me } from './store';
import { deleteFile, readFile, writeFile } from './sync/github';

export const VAPID_PUBLIC = 'BGvgj4B5IXfH0e_fkrvSDNOapArvCpnZiY3QSxjwKcDmZnUqrqZkknpgzrMNT12MDR9Efk1V7lwcHQCl5KizkNE';
const K_DEVICE = 'cashflow-device';
const K_PUSH = 'cashflow-push';

export interface PushPrefs {
  scope: 'mine' | 'all';
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(K_DEVICE);
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(K_DEVICE, id);
    }
    return id;
  } catch {
    return 'd-unknown';
  }
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone only allows notifications for an app opened from the home screen. */
export function isHomeScreenApp(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
}

export function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function pushState(): { on: boolean; scope: 'mine' | 'all' } {
  try {
    const raw = localStorage.getItem(K_PUSH);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { on: false, scope: 'mine' };
}
function savePushState(s: { on: boolean; scope: 'mine' | 'all' }) {
  try {
    localStorage.setItem(K_PUSH, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function keyBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  return 'Browser';
}

export async function enablePush(scope: 'mine' | 'all'): Promise<string | null> {
  if (!pushSupported()) return isIOS() && !isHomeScreenApp() ? 'On iPhone, add the app to your home screen first (Share → Add to Home Screen), then open it from there.' : 'This browser cannot show notifications.';
  const conn = getConn();
  if (!conn) return 'Connect the private store first (Settings → Sync).';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications were not allowed. You can allow them in the phone’s Settings → Notifications.';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) as BufferSource });
  const who = me() || '';
  const body = JSON.stringify({ subscription: sub.toJSON(), person: who, scope, device: deviceName(), u: Date.now() }, null, 1);
  const path = `push/${deviceId()}.json`;
  const cur = await readFile(conn, path);
  const name = getState().people[who]?.name || 'someone';
  const res = await writeFile(conn, path, body, cur?.sha ?? null, `Notifications on for ${name}'s ${deviceName()}`);
  if (res === 'conflict') return 'Could not save — please try again.';
  savePushState({ on: true, scope });
  return null;
}

export async function disablePush(): Promise<string | null> {
  const conn = getConn();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe();
    if (conn) await deleteFile(conn, `push/${deviceId()}.json`, `Notifications off on a ${deviceName()}`);
  } catch (e) {
    return (e as Error).message;
  }
  savePushState({ on: false, scope: pushState().scope });
  return null;
}

export async function testNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Cash flow', { body: 'Notifications work on this device.', icon: 'pwa-192x192.png', badge: 'pwa-64x64.png', tag: 'test' });
}
