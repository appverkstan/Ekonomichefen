/* Ekonomichefen – service worker
   Gör att appen kan öppnas utan internet.
   Med internet hämtas alltid den senaste versionen av appen (så att
   uppdateringar syns direkt). Utan internet används den sparade kopian.
   Din ekonomiska data hanteras INTE här, utan i appens lokala databas. */
const CACHE = 'ekonomichefen-v6';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' = hämta direkt från servern, aldrig en gammal kopia
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !font) return; // anrop till Google Apps Script går alltid direkt till nätet
  const key = req.mode === 'navigate' ? './index.html' : req;

  if (font) {
    // Typsnitt ändras aldrig – sparad kopia först
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })));
    return;
  }

  // Appens egna filer: nätet först (färsk version), sparad kopia om nätet saknas eller är långsamt
  e.respondWith(caches.open(CACHE).then(async cache => {
    const fromNet = fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' })).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    });
    const timeout = new Promise(res => setTimeout(res, 4000));
    try {
      const res = await Promise.race([fromNet, timeout]);
      if (res) return res;
    } catch (err) { /* offline */ }
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    return hit || fromNet;
  }));
});
