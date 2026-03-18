importScripts('./db.js');

  // --- IndexedDBヘルパー関数ここまで ---
////index.html や db.js を変更したら、必ず sw.txt の CACHE_NAME のバージョンを上げてください（例: v4.1 → v4.2）。これが更新の引き金となります。
const CACHE_NAME = 'map-app-cache-v10.0'; 

// ★ オフラインで表示したいファイルのリスト
const urlsToCache = [
  './',          // index.html (ルートURL)
  './db.js'      // db.js
  // CSSやロゴ画像など、他にキャッシュしたいファイルがあればここに追加
];


  // インストール時にキャッシュを作成
  self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        // GASのWebアプリでは、動的に生成されるため、
        // ルートURLだけをキャッシュするのが基本
        return cache.addAll(urlsToCache);
      })
    );
    self.skipWaiting(); // ★ 新しいSWをすぐに有効化するおまじない
  });

  // 新しいService Workerがアクティブになったら、古いキャッシュを削除
//index.html や db.js を変更したら、必ず sw.txt の CACHE_NAME のバージョンを上げてください（例: v4.1 → v4.2）。これが更新の引き金となります。
  self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    // ★★★ ホワイトリスト方式で、保持すべきキャッシュを明示する ★★★
    const cacheWhitelist = [CACHE_NAME];

    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // ホワイトリストに含まれていないキャッシュ（＝古いバージョンのアプリキャッシュ）を削除
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }).then(() => {
        // すべてのクライアント（タブ）の制御を新しいService Workerが引き継ぐ
        console.log('Service Worker: Now ready to handle fetches!');
        return self.clients.claim();
      })
    );
  });

  // fetchイベントでリクエストを傍受（キャッシュファースト戦略）
  self.addEventListener('fetch', event => {
     const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // ★ Google Mapsの通信はService Workerで処理せず、ブラウザ標準に任せる
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('googleusercontent.com')) {
	  return; 
  }

  // アプシェルのリクエスト (Cache First)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cachedResponse => {
      return cachedResponse || fetch(request);
    })
  );
    /*
    const requestUrl = new URL(event.request.url);
    // doPostへのリクエストはキャッシュしない（常にネットワークへ）
    if (event.request.method === 'POST') {
      return;
    }

    // ★ 地図タイルのリクエストかどうかをURLで判定
    if (requestUrl.hostname === 'maps.googleapis.com' || requestUrl.hostname.endsWith('.googleusercontent.com')) {
      
      // ★ 地図タイルには「Stale-While-Revalidate」戦略が適している
      event.respondWith(
        caches.open(MAPS_CACHE_NAME).then(cache => 
          return cache.match(event.request).then(response => {
            // 1. まずキャッシュから返す (Stale)
            const fetchPromise = fetch(event.request).then(networkResponse => {
              // 2. 裏側でネットワークから新しいものを取得し、キャッシュを更新 (Revalidate)
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
            // キャッシュにあればそれを返し、なければネットワークの結果を待つ
            return response || fetchPromise;
          })
        )
      );
      return; // 地図タイルの処理はここで終了
    }

      event.respondWith(
      caches.match(event.request, { ignoreSearch: true })
      .then(response => {
        if (response) {
          console.log('SW: Serving from cache:', event.request.url);
          return response; // キャッシュにあればそれを返す
        }
        console.log('SW: Fetching from network:', event.request.url);
        // キャッシュになければネットワークから取得
        return fetch(event.request);
      })
    );
    */
  });
  

  // バックグラウンド同期イベント
  self.addEventListener('sync', event => {
    console.log('Service Worker: Sync event received for tag:', event.tag);
    if (event.tag === 'sync-updates') {
      event.waitUntil(syncUpdates());
    }
  });
  

  // ★★★ 同期処理の実体 ★★★
  async function syncUpdates() {
    console.log('Service Worker: Starting sync process...');
    try {
      // ★★★ dbManager. を付けて呼び出す ★★★
        const queue = await dbManager.getQueue(); 
        if (queue.length === 0) {
            console.log('Service Worker: Queue is empty. Nothing to sync.');
            return;
        }
      // ★★★ 毎回DBから設定を読み込む ★★★
      const WEB_APP_URL = await dbManager.getConfig('webAppUrl');
      const SPREADSHEET_ID = await dbManager.getConfig('spreadsheetId');
      const SECRET_TOKEN = await dbManager.getConfig('secretToken');

      if (!WEB_APP_URL || !SPREADSHEET_ID || !SECRET_TOKEN) {
          throw new Error("Configuration is not available in Service Worker.");
      }
      //const queue = await dbManager.getQueue();
      if (queue.length === 0) {
        console.log('Service Worker: Queue is empty. Nothing to sync.');
        return;
      }
      
      console.log(`Service Worker: Found ${queue.length} items to sync.`);
      
      // サーバーに送るためのデータ形式に変換
      const updates = queue.map(item => ({
	spreadsheetId: item.spreadsheetId,
        row: item.rowNumber,
        status: item.valueToSet
      }));

      // doPostにfetchでリクエストを送信
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchUpdateStatuses',
          token: SECRET_TOKEN,
          updates: updates
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const result = await response.json();

      if (result.success) {
        console.log('Service Worker: Sync successful! Clearing queue.');
        await dbManager.clearQueue(); 
      } else {
        console.error('Service Worker: Sync failed on server.', result.message);
        // ここでリトライ処理などを実装することも可能
        throw new Error('Server-side sync failed');
      }

    } catch (error) {
      console.error('Service Worker: Sync process failed due to network or other error.', error);
      // エラーを再スローして、ブラウザに同期が失敗したことを伝える
      throw error;
    }
  }












