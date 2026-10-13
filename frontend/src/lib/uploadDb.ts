// Simple & robust IndexedDB wrapper for storing File objects across reloads

const DB_NAME = 'inmeet_drive_uploads_db';
const DB_VERSION = 1;
const STORE_NAME = 'active_uploads';

export interface StoredUploadTask {
  id: string;
  file?: File;
  filename: string;
  relativePath: string;
  totalBytes: number;
  uploadedBytes: number;
  chunkSize: number;
  totalChunks: number;
  lastChunkIndex: number;
  parentFolderId: string | null;
  parentFolderName?: string;
  status: 'uploading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openUploadDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

export async function saveUploadToDB(task: StoredUploadTask): Promise<void> {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        ...task,
        updatedAt: Date.now(),
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save upload task to IndexedDB:', err);
  }
}

export async function getAllUploadsFromDB(): Promise<StoredUploadTask[]> {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to get upload tasks from IndexedDB:', err);
    return [];
  }
}

export async function removeUploadFromDB(id: string): Promise<void> {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to remove upload task from IndexedDB:', err);
  }
}

export async function clearCompletedUploadsFromDB(): Promise<void> {
  try {
    const all = await getAllUploadsFromDB();
    const completed = all.filter((t) => t.status === 'completed');
    for (const t of completed) {
      await removeUploadFromDB(t.id);
    }
  } catch (err) {
    console.warn('Failed to clear completed uploads from IndexedDB:', err);
  }
}
