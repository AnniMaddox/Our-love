/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const appBase = import.meta.env.BASE_URL;
const navigationHandler = createHandlerBoundToURL(`${appBase}index.html`);
registerRoute(new NavigationRoute(navigationHandler));

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      if (windowClients.length > 0) {
        await windowClients[0].focus();
        return;
      }

      await self.clients.openWindow(appBase);
    })(),
  );
});
