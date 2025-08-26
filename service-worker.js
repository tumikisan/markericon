
  const dbManager = (() => {

      const DB_NAME = 'map-app-db';
      const DB_VERSION = 4;
      const UPDATE_STORE_NAME = 'updateQueue';
      const CONFIG_STORE_NAME = 'config'; // ★ 設定用ストア名
      const FEATURES_STORE_NAME = 'featuresStore'
      let db;// この'db'変数は、このIIFEの中だけで有効になる


      function openDb() {
        return new Promise((resolve, reject) => {
          if (db) return resolve(db);

          const request = indexedDB.open(DB_NAME, DB_VERSION);

          request.onerror = (event) => reject("IndexedDB error: " + request.error);
          request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
          };
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(UPDATE_STORE_NAME)) {
            db.createObjectStore(UPDATE_STORE_NAME, { keyPath: 'rowNumber' });
            }
            if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
              db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(FEATURES_STORE_NAME)) {
                db.createObjectStore(FEATURES_STORE_NAME, { keyPath: 'id' });
            }

          };
        });
      }

    // ★ データを保存・取得する関数を追加
    async function cacheFeatures(features) {
        const db = await openDb();
        const tx = db.transaction(FEATURES_STORE_NAME, 'readwrite');
        const store = tx.objectStore(FEATURES_STORE_NAME);
        // 常に最新のデータで上書きするため、キーは固定値 'main' などにする
        await promisifyRequest(store.put({ id: 'main', data: features }));
        return new Promise(resolve => { tx.oncomplete = () => resolve(); });
      
    }
    async function getCachedFeatures() {
        const db = await openDb();
        const tx = db.transaction(FEATURES_STORE_NAME, 'readonly');
      const store = tx.objectStore(FEATURES_STORE_NAME); // ★ 正しいストア取得
        const result = await promisifyRequest(store.get('main'));
        return result ? result.data : null;
    }

    // ★★★ Promiseでラップしたヘルパー関数 ★★★
    function promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ★ 設定を保存/取得する関数を追加
    async function setConfig(key, value) {
        const db = await openDb();
        const tx = db.transaction(CONFIG_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONFIG_STORE_NAME); // ★ 正しいストア取得方法
        await store.put({ key, value });
        return new Promise(resolve => { tx.oncomplete = () => resolve(); });
    }
    
    async function getConfig(key) {
        const db = await openDb();
        const tx = db.transaction(CONFIG_STORE_NAME, 'readonly');
        const store = tx.objectStore(CONFIG_STORE_NAME); 
        const request = store.get(key);
        const result = await promisifyRequest(request);
        return result ? result.value : undefined;
    }

      async function putToQueue(update) {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      store.put(update);
        return new Promise(resolve => { tx.oncomplete = () => resolve(); });
    }

    async function getQueue() {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      return await promisifyRequest(store.getAll());
    }

    async function clearQueue() {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      store.clear();
        return new Promise(resolve => { tx.oncomplete = () => resolve(); });
    }

    // ★ 2. return { ... } を追加
    return {
      putToQueue: putToQueue,
      getQueue: getQueue,
      clearQueue: clearQueue,
      setConfig,
      getConfig,
      cacheFeatures, getCachedFeatures
    };

  })(); // ★ 3. })(); を追加

  // --- IndexedDBヘルパー関数ここまで ---

const CACHE_NAME = 'map-app-cache-v4'; 
const MAPS_CACHE_NAME = 'maps-tiles-cache-v1';

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

  // 有効化時に古いキャッシュを削除する
  self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME) {
              console.log('Service Worker: Clearing old cache');
              return caches.delete(cache);
            }
          })
        );
      })
    );
    return self.clients.claim(); // ★ 新しいSWがすぐにページを制御するおまじない
  });

  // fetchイベントでリクエストを傍受（キャッシュファースト戦略）
  self.addEventListener('fetch', event => {
     const requestUrl = new URL(event.request.url);
  if (event.request.method === 'POST') return;

  // 地図タイルリクエストの処理
  if (requestUrl.hostname.includes('googleapis.com') || requestUrl.hostname.includes('googleusercontent.com')) {
    event.respondWith(
      caches.open(MAPS_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  // アプシェルリクエストの処理
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(response => {
      return response || fetch(event.request);
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
          // spreadsheetIdはサーバー側で固定か、別途取得する必要がある
          // ここでは仮に固定値とするか、IndexedDBに保存しておく
          spreadsheetId: SPREADSHEET_ID,
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



















