const CACHE_NAME = 'skinbiee-cache-v26';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/skinbiee.html',
    '/style.css',
    '/skinbiee.css',
    '/skinbiee.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    // Force immediate takeover with zero friction.
    // Eager cache.addAll can fail if the CDN redirects /index.html to / (301s fail addAll),
    // causing the new SW to silently abort installation leaving users stuck on old versions.
    // The NetworkFirst fetch handler will automatically heavily cache these on first load anyway.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        return; // Let browser handle it directly
    }

    event.respondWith(
        fetch(request).then(response => {
            // Cache successful GET responses from our own domain
            if (response && response.status === 200 && response.type === 'basic') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
            }
            return response;
        }).catch(() => {
            return caches.match(request, { ignoreSearch: true }).then(cached => {
                if (cached) {
                    return cached;
                }
                if (request.mode === 'navigate' || request.destination === 'document') {
                    return caches.match('/index.html', { ignoreSearch: true });
                }
                return new Response('Network Error', { status: 408, statusText: 'Network Error' });
            });
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
            return Promise.resolve();
        })
    );
});
