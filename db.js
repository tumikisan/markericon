
  const dbManager = (() => {

      const DB_NAME = 'map-app-db';
      const DB_VERSION = 1;
      const STORE_NAME = 'updateQueue';
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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'rowNumber' });
            } 
          };
        });
      }

      async function putToQueue(update) {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await store.put(update); 
      return tx.done;
    }

    async function getQueue() {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      return await store.getAll();
    }

    async function clearQueue() {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await store.clear();
      return tx.done;
    }

    // ★ 2. return { ... } を追加
    return {
      putToQueue: putToQueue,
      getQueue: getQueue,
      clearQueue: clearQueue
    };

  })(); // ★ 3. })(); を追加

