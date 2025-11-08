// /public/sw.js

const CACHE_NAME = 'callsys-cache-v1';
// v15 (與您的 CSS/JS 版本號同步)
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css?v=15',
    '/js/main.js?v=15',
    '/socket.io/socket.io.js',
    '/ding.mp3',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// 1. 安裝 Service Worker 並快取核心資產
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 正在快取核心資產...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(err => console.error('[SW] 快取失敗', err))
    );
    self.skipWaiting();
});

// 2. 啟用 Service Worker
self.addEventListener('activate', (event) => {
    // 移除舊快取
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// 3. 攔截網路請求 (Cache First 策略)
self.addEventListener('fetch', (event) => {
    // 我們只快取 GET 請求
    if (event.request.method !== 'GET') {
        return;
    }
    
    // 對於 Socket.io 的 /socket.io/ 連線 (非 JS 檔案)，永遠使用網路
    if (event.request.url.includes('/socket.io/')) {
        return event.respondWith(fetch(event.request));
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果快取中找到，直接回傳
                if (response) {
                    return response;
                }

                // 如果快取中沒有，則透過網路請求
                return fetch(event.request).then(
                    (networkResponse) => {
                        // (可選) 我們不在這裡快取新的東西，只快取 install 時的列表
                        return networkResponse;
                    }
                );
            })
            .catch(err => {
                console.error('[SW] Fetch 錯誤', err);
                // 真正的離線：您可以回傳一個備用的離線頁面
            })
    );
});