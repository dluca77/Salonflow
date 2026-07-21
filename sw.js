// Kronr service worker -- alleen bedoeld om de app installeerbaar te maken
// ("Toevoegen aan beginscherm") voor personeel, NIET om data te versnellen.
// Dit is een boekingssysteem met live gegevens (agenda, beschikbaarheid,
// betalingen) -- we willen nooit verouderde data tonen zolang er internet
// is. Alles gaat dus altijd eerst naar het netwerk; de cache is puur een
// noodval voor als de verbinding wegvalt.

const CACHE_NAME = 'kronr-shell-v1';
const PRECACHE_URLS = ['/favicon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // geen Supabase/Stripe/CDN's cachen

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
