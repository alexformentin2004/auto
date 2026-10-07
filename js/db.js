import { DB_CONFIG } from './config.js';

let dbPromise;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const storeName of Object.values(DB_CONFIG.stores)) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const database = req.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    req.onerror = () => reject(req.error || new Error('Impossibile aprire il database AUTO.'));
    req.onblocked = () => reject(new Error('Database AUTO bloccato da un’altra scheda/versione aperta. Chiudi le altre istanze e riprova.'));
  });
  return dbPromise;
}

async function tx(storeName, mode, operation) {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    let request;
    try {
      request = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || transaction.error || new Error('Errore IndexedDB.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || request?.error || new Error('Transazione IndexedDB annullata.'));
    transaction.onerror = () => reject(transaction.error || request?.error || new Error('Errore transazione IndexedDB.'));
  });
}

async function replaceAllAtomic(storeRows) {
  const database = await openDb();
  const storeNames = Object.keys(storeRows || {});
  if (!storeNames.length) return true;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, 'readwrite');
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error || new Error('Errore transazione IndexedDB.'));
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    transaction.onabort = () => fail(transaction.error || new Error('Transazione IndexedDB annullata.'));
    transaction.onerror = () => fail(transaction.error || new Error('Errore transazione IndexedDB.'));
    try {
      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const row of (storeRows[storeName] || [])) store.put(row);
      }
    } catch (error) {
      try { transaction.abort(); } catch (_) {}
      fail(error);
    }
  });
}

export const db = {
  all(storeName) { return tx(storeName, 'readonly', s => s.getAll()); },
  get(storeName, id) { return tx(storeName, 'readonly', s => s.get(id)); },
  put(storeName, value) { return tx(storeName, 'readwrite', s => s.put(value)); },
  delete(storeName, id) { return tx(storeName, 'readwrite', s => s.delete(id)); },
  clear(storeName) { return tx(storeName, 'readwrite', s => s.clear()); },
  replaceAllAtomic
};
