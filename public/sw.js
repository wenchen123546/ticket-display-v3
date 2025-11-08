// /public/sw.js (v3.4 修改版)

// 【v3.4】 變更快取名稱以強制更新
const CACHE_NAME = 'callsys-cache-v2'; 

// v15 (與您的 CSS/JS 版本號同步)
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css?v=15',
    '/js/main.js?v=15',
    // 【v3.4 修復】 移除 /socket.io/socket.io.js，它不是靜態檔案
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
                console.log('[SW] 正在快取核心資產 (v3.4)...');
                // addAll 會確保所有資產都快取成功，否則 install 失敗
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(err => console.error('[SW] v3.4 快取失敗', err))
    );
    self.skipWaiting(); // 強制新的 SW 立即生效
});

// 2. 啟用 Service Worker
self.addEventListener('activate', (event) => {
    // 移除 v1 的舊快取
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 正在移除舊快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // 取得頁面控制權
});

// 3. 攔截網路請求 (Cache First 策略)
self.addEventListener('fetch', (event) => {
    // 我們只處理 GET 請求
    if (event.request.method !== 'GET') {
        return;
    }
    
    // 【v3.4 關鍵】 
    // 對於 /socket.io/ (包含 socket.io.js 和所有 WS/Polling 請求)
    // 永遠使用網路，絕不快取。
    if (event.request.url.includes('/socket.io/')) {
        return event.respondWith(fetch(event.request));
    }

    // 對於其他所有請求 (App Shell)
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 1. 優先從快取回傳
                if (response) {
                    return response;
                }

                // 2. 快取未命中，從網路擷取
                // (我們不在這裡快取新的動態 API 請求，只依賴 install 時的列表)
                return fetch(event.request);
            })
            .catch(err => {
                console.error('[SW] Fetch 錯誤', err);
                // 您可以在此回傳一個離線 fallback 頁面
            })
    );
});
