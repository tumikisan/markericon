
  const dbManager = (() => {

      const DB_NAME = 'map-app-db';
      const DB_VERSION = 2;
      const UPDATE_STORE_NAME = 'updateQueue';
      const CONFIG_STORE_NAME = 'config'; // ★ 設定用ストア名
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

          };
        });
      }

    // ★ 設定を保存/取得する関数を追加
    async function setConfig(key, value) {
        const db = await openDb();
        const tx = db.transaction(CONFIG_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONFIG_STORE_NAME); // ★ 正しいストア取得方法
        await store.put({ key, value });
        return tx.done;
    }
    
    async function getConfig(key) {
        const db = await openDb();
        const tx = db.transaction(CONFIG_STORE_NAME, 'readonly');
        const store = tx.objectStore(CONFIG_STORE_NAME); 
        const config = await store.get(key);
        return config ? config.value : undefined;
    }

      async function putToQueue(update) {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      await store.put(update); 
      return tx.done;
    }

    async function getQueue() {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readonly');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      return await store.getAll();
    }

    async function clearQueue() {
      const db = await openDb();
      const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UPDATE_STORE_NAME);
      await store.clear();
      return tx.done;
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







