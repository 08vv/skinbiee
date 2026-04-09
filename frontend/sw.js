const CACHE_NAME = 'skinbiee-cache-v22';
const ASSETS_TO_CACHE = [
    '/',
    'skinbiee.html',
    'index.html',
    'style.css',
    'skinbiee.css',
    'skinbiee.js',
    'manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        self.skipWaiting();
        clients.claim();
        caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Never cache API calls or non-GET requests. They must always hit network.
    if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(request));
        return;
    }

    // Network-first for skinbiee.js to allow quick fixes
    if (request.url.includes('skinbiee.js') || request.url.includes('index.html') || request.url.includes('skinbiee.html')) {
        event.respondWith(
            fetch(request).then(response => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/skinbiee.html');
            return Promise.resolve();
        })
    );
});
