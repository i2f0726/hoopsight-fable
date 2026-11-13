/* オフラインでも開けるようにする。つながるときは必ず新しいものを取り、だめなら保存分を使う */
const CACHE = 'hoopsight-v11';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']; // タイトルロゴの文字（Barlow Condensed）
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (FONT_HOSTS.includes(url.hostname)) { // フォントは一度取れたら保存分を使う（オフラインでも同じ見た目）
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
