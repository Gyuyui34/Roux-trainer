// オフライン用キャッシュ。ファイルを更新したら VERSION を上げる
const VERSION = 'v68';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/fx.js', 'js/drills.js', 'js/cmll.js', 'js/cube.js', 'js/solver.js', 'js/view3d.js', 'js/player.js', 'js/lse.js',
  'js/eolr.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ネットワーク優先、オフライン時はキャッシュ。
// 同じサイトのファイルはブラウザの HTTP キャッシュ(GitHub Pages は 10 分)を使わず毎回サーバーに確かめる
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const same = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(e.request, same ? { cache: 'no-cache' } : undefined).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
