/* PWA Service Worker for Skinbiee */
const CACHE_NAME = 'skinbiee-cache-v2';
const ASSETS_TO_CACHE = [
    '/',
    '/skinbiee.html',
    '/style.css',
    '/skinbiee.css',
    '/skinbiee.js',
    '/assets/girl_normal.png',
    '/assets/girl_thumbs.png',
    '/assets/icon-192x192.png',
    '/assets/icon-512x512.png',
    '/assets/apple-touch-icon.png',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => 
            Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});
