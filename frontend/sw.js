const CACHE_NAME = 'skinbiee-cache-v3';
const ASSETS_TO_CACHE = [
    '/',
    'skinbiee.html',
    'style.css',
    'skinbiee.css',
    'skinbiee.js',
    'manifest.json',
    'assets/apple-touch-icon.png',
    'assets/blue-flame.png',
    'assets/girl_normal.png',
    'assets/girl_thumbs.png',
    'assets/icon-192x192.png',
    'assets/icon-512x512.png',
    'assets/mascot-done.png',
    'assets/mascot-thumbs-up.png',
    'assets/planner-calendar.png',
    'assets/scan-face-trans.png',
    'assets/scan-face.jpg',
    'assets/scan-face.png',
    'assets/scan-product-trans.png',
    'assets/scan-product.png',
    'assets/timeline-icon.png',
    'assets/timeline.png'
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
