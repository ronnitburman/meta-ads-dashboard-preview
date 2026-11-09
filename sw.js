// Service worker: makes the installed app work offline and receives CSVs
// shared from other apps (Android share sheet). Only active over http(s);
// opening index.html from disk skips it.

const SHELL = 'shell-v1';
const SHARED = 'shared-files';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/styles.css',
  'src/parse.js',
  'src/analyze.js',
  'src/report.js',
  'src/app.js',
  'vendor/papaparse.min.js',
  'vendor/chart.umd.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== SHARED) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Shared files are parked in a cache; the page picks them up from ?shared=1.
async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARED);
  let n = 0;
  for (const file of form.getAll('csv')) {
    if (!(file instanceof File)) continue;
    await cache.put(`shared/${n++}`, new Response(file, { headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': 'text/csv' } }));
  }
  return Response.redirect('./?shared=1', 303);
}

// Stale-while-revalidate: answer from cache instantly, refresh it in the
// background so the next launch gets the latest version.
async function fromCache(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached ?? (await network) ?? (request.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method === 'GET') event.respondWith(fromCache(event.request));
});
