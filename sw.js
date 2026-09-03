// Bump this version string every time app.js/index.html/styles.css change.
// Changing this file's contents is also what makes the browser notice
// there's a new service worker to install at all — a service worker file
// that never changes is invisible to the update check, so a version bump
// here matters even if nothing else in this file is touched.
const CACHE_NAME = 'rompecabezas-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.png',
  './icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always try to fetch the latest version when the person is
// online, and only fall back to the cached copy if the network request
// fails (actually offline). This is what makes updates show up the moment
// they're re-deployed, instead of being invisibly stuck on whatever was
// cached the first time the app was opened.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
