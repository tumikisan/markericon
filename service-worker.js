
  
  const CACHE_NAME = 'map-app-cache-v2';
  let WEB_APP_URL, SPREADSHEET_ID, SECRET_TOKEN;

  self.addEventListener('message', event => {
      if (event.data && event.data.type === 'INIT_CONFIG') {
          WEB_APP_URL = event.data.webAppUrl;
          SPREADSHEET_ID = event.data.spreadsheetId;
          SECRET_TOKEN = event.data.secretToken;
          console.log('Service Worker configured.');
      }
  });

  // --- 2. IndexedDBヘルパー関数 (db.htmlからコピー) ---
  const DB_NAME = 'map-app-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'updateQueue';
  let db; // このdb変数はService Workerスコープ内で使われる

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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'rowNumber' });
        }
      };
    });
  }

  async function getQueue() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function clearQueue() {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  // --- IndexedDBヘルパー関数ここまで ---


  // インストール時にキャッシュを作成
  self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        // GASのWebアプリでは、動的に生成されるため、
        // ルートURLだけをキャッシュするのが基本
        return cache.add(new Request(self.registration.scope, { cache: 'reload' }));
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
    // doPostへのリクエストはキャッシュしない（常にネットワークへ）
    if (event.request.method === 'POST') {
      return;
    }
    
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          return response; // キャッシュにあればそれを返す
        }
        // キャッシュになければネットワークから取得
        return fetch(event.request);
      })
    );
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
      const queue = await getQueue();
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
        await clearQueue();
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

