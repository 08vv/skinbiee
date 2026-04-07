const CACHE_NAME = 'skinbiee-cache-v6';
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
        caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network-first for skinbiee.js to allow quick fixes
    if (event.request.url.includes('skinbiee.js') || event.request.url.includes('index.html')) {
        event.respondWith(
            fetch(event.request).then(response => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
