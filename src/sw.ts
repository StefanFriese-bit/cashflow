/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string; count?: number } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Payments due soon';
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || '',
        tag: data.tag || 'due',
        icon: 'pwa-192x192.png',
        badge: 'pwa-64x64.png',
        data: { url: data.url || './#/today' },
      });
      // the red number on the home-screen icon
      if (data.count && 'setAppBadge' in self.navigator) await (self.navigator as any).setAppBadge(data.count).catch(() => {});
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './#/today', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).focus();
          (c as WindowClient).navigate?.(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
