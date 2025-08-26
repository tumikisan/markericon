
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
        // 常に最新のデータで上書きするため、キーは固定値 'main' などにする
        await tx.store.put({ id: 'main', data: features });
        return tx.done;
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
      getConfig
    };

  })(); // ★ 3. })(); を追加











