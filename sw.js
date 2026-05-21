/* ===== FANZA Service Worker ===== */
const CACHE  = 'fanza-v33';
const STATIC = [
    '/',
    '/home.html',
    '/product.html',
    '/actress.html',
    '/actresses.html',
    '/index.html',
    '/css/style.css',
    '/js/storage.js',
    '/js/dmm-api.js',
    '/js/app.js',
];

// インストール：静的アセットをキャッシュ
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(STATIC))
            .then(() => self.skipWaiting())
    );
});

// アクティベート：古いキャッシュを削除
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// フェッチ：dataファイルはネットワーク優先、静的ファイルはキャッシュ優先
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // data/フォルダはネットワーク優先（常に最新データを取得）
    if (url.pathname.includes('/data/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // 静的アセット：キャッシュ優先
    e.respondWith(
        caches.match(e.request)
            .then(cached => cached || fetch(e.request).then(res => {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            }))
    );
});
