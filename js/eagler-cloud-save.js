import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw',
  authDomain: 'knowwhere-firebase.firebaseapp.com',
  projectId: 'knowwhere-firebase',
  storageBucket: 'knowwhere-firebase.firebasestorage.app',
  messagingSenderId: '389831660515',
  appId: '1:389831660515:web:0bcd3292610b1be0af86d6'
};

const ENABLED_KEY = 'kw_eagler_cloud_saves';
const DATABASES_KEY = 'kw_eagler_cloud_databases';
const LAST_RESTORE_PREFIX = 'kw_eagler_cloud_restored_';
const PENDING_LOAD_PREFIX = 'kw_eagler_cloud_load_';
const CHUNK_CHARACTERS = 400000;
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const nativeOpen = indexedDB.open.bind(indexedDB);
let activeUser = null;
let uploadInFlight = null;
let lastUploadedDigest = '';

function cloudEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== '0';
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))
  ]);
}

function clientKey() {
  return location.pathname
    .replace(/\/[^/]*\.html?$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9_-]+/gi, '_') || 'eaglercraft';
}

function saveDocument(user) {
  return doc(db, 'users', user.email, 'eaglerCloudSaves', clientKey());
}

function chunkDocument(user, generation, index) {
  return doc(saveDocument(user), 'chunks', `${generation}_${String(index).padStart(5, '0')}`);
}

function isEaglerSaveDatabase(name) {
  const value = String(name || '');
  return /^worlds(?:[_-].*)?$/i.test(value)
    || /^_net_lax1dude_eaglercraft.*PlatformFilesystem/i.test(value);
}

function rememberedDatabases() {
  try {
    const value = JSON.parse(localStorage.getItem(DATABASES_KEY) || '[]');
    return Array.isArray(value) ? value.filter(isEaglerSaveDatabase) : [];
  } catch (_) {
    return [];
  }
}

function rememberDatabase(name) {
  if (!isEaglerSaveDatabase(name)) return;
  const names = new Set(rememberedDatabases());
  names.add(String(name));
  localStorage.setItem(DATABASES_KEY, JSON.stringify([...names]));
}

// Capture the database selected by any current or future Eaglercraft build.
indexedDB.open = function (name, version) {
  rememberDatabase(name);
  return arguments.length > 1 ? nativeOpen(name, version) : nativeOpen(name);
};

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(name) {
  return requestResult(nativeOpen(name));
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Could not replace ${name}`));
    request.onblocked = () => reject(new Error(`Database ${name} is still open`));
  });
}

function bytesToBase64(bytes) {
  let result = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    result += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(result);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encodeValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof ArrayBuffer) return { $kwType: 'ArrayBuffer', data: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { $kwType: value.constructor.name, data: bytesToBase64(bytes) };
  }
  if (value instanceof Blob) {
    return { $kwType: 'Blob', mime: value.type, data: bytesToBase64(new Uint8Array(await value.arrayBuffer())) };
  }
  if (value instanceof Date) return { $kwType: 'Date', data: value.toISOString() };
  if (seen.has(value)) throw new Error('A save record contains a circular value');
  seen.add(value);
  if (Array.isArray(value)) {
    const output = [];
    for (const item of value) output.push(await encodeValue(item, seen));
    seen.delete(value);
    return output;
  }
  const output = {};
  for (const key of Object.keys(value)) output[key] = await encodeValue(value[key], seen);
  seen.delete(value);
  return output;
}

function decodeValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.$kwType) {
    if (value.$kwType === 'Date') return new Date(value.data);
    const bytes = base64ToBytes(value.data || '');
    if (value.$kwType === 'Blob') return new Blob([bytes], { type: value.mime || '' });
    if (value.$kwType === 'ArrayBuffer') return bytes.buffer;
    const Type = globalThis[value.$kwType];
    if (typeof Type === 'function' && Type.BYTES_PER_ELEMENT) {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new Type(copy);
    }
    return bytes;
  }
  if (Array.isArray(value)) return value.map(decodeValue);
  const output = {};
  for (const key of Object.keys(value)) output[key] = decodeValue(value[key]);
  return output;
}

async function databaseNames() {
  const names = new Set(rememberedDatabases());
  if (typeof indexedDB.databases === 'function') {
    const entries = await indexedDB.databases();
    for (const entry of entries) if (isEaglerSaveDatabase(entry.name)) names.add(entry.name);
  }
  return [...names];
}

async function exportDatabase(name) {
  const database = await openDatabase(name);
  try {
    const stores = [];
    for (const storeName of database.objectStoreNames) {
      const transaction = database.transaction(storeName, 'readonly');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(storeName);
      const [keys, values] = await Promise.all([
        requestResult(store.getAllKeys()),
        requestResult(store.getAll())
      ]);
      await done;
      const records = [];
      for (let i = 0; i < values.length; i += 1) {
        records.push({ key: await encodeValue(keys[i]), value: await encodeValue(values[i]) });
      }
      stores.push({
        name: store.name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: [...store.indexNames].map(indexName => {
          const index = store.index(indexName);
          return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
        }),
        records
      });
    }
    return { name, version: database.version, stores };
  } finally {
    database.close();
  }
}

async function createSnapshot() {
  const databases = [];
  for (const name of await databaseNames()) databases.push(await exportDatabase(name));
  return { schema: 1, client: clientKey(), savedAt: Date.now(), databases };
}

async function importDatabase(snapshot) {
  await deleteDatabase(snapshot.name);
  const database = await new Promise((resolve, reject) => {
    const request = nativeOpen(snapshot.name, Math.max(1, Number(snapshot.version) || 1));
    request.onupgradeneeded = () => {
      for (const storeData of snapshot.stores || []) {
        const options = { autoIncrement: !!storeData.autoIncrement };
        if (storeData.keyPath !== null && typeof storeData.keyPath !== 'undefined') options.keyPath = storeData.keyPath;
        const store = request.result.createObjectStore(storeData.name, options);
        for (const index of storeData.indexes || []) {
          store.createIndex(index.name, index.keyPath, { unique: !!index.unique, multiEntry: !!index.multiEntry });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`Could not restore ${snapshot.name}`));
  });
  try {
    for (const storeData of snapshot.stores || []) {
      if (!storeData.records?.length) continue;
      const transaction = database.transaction(storeData.name, 'readwrite');
      const store = transaction.objectStore(storeData.name);
      for (const record of storeData.records) {
        const value = decodeValue(record.value);
        if (store.keyPath === null) store.put(value, decodeValue(record.key));
        else store.put(value);
      }
      await transactionDone(transaction);
    }
  } finally {
    database.close();
  }
  rememberDatabase(snapshot.name);
}

function digest(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + ':' + text.length;
}

function setStatus(message, error = false) {
  let status = document.getElementById('kw-eagler-cloud-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'kw-eagler-cloud-status';
    status.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:8px 11px;border-radius:7px;background:rgba(15,15,20,.9);border:1px solid rgba(168,85,247,.55);color:#fff;font:12px system-ui,sans-serif;pointer-events:none;transition:opacity .2s';
    document.body.appendChild(status);
  }
  status.textContent = message;
  status.style.borderColor = error ? 'rgba(239,68,68,.7)' : 'rgba(168,85,247,.55)';
  status.style.opacity = '1';
  clearTimeout(status._hideTimer);
  status._hideTimer = setTimeout(() => { status.style.opacity = '0'; }, error ? 6000 : 2500);
}

async function syncPreference(user) {
  const snapshot = await getDoc(doc(db, 'users', user.email));
  const preference = snapshot.exists() ? snapshot.data()?.prefs?.eaglerCloudSaves : undefined;
  if (typeof preference === 'boolean') localStorage.setItem(ENABLED_KEY, preference ? '1' : '0');
  else if (localStorage.getItem(ENABLED_KEY) === null) localStorage.setItem(ENABLED_KEY, '1');
}

async function restoreFromCloud(user, control, force = false) {
  const manifest = await getDoc(saveDocument(user));
  if (control.cancelled) return;
  if (!manifest.exists()) return;
  const metadata = manifest.data();
  const cloudTime = Number(metadata.savedAt || 0);
  const restoreKey = LAST_RESTORE_PREFIX + clientKey();
  const localTime = Number(localStorage.getItem(restoreKey) || 0);
  if (!force && cloudTime && cloudTime <= localTime) return;
  setStatus('Restoring Eaglercraft cloud save…');
  const count = Math.max(0, Number(metadata.chunkCount) || 0);
  const generation = String(metadata.generation || '');
  if (!count || !generation) throw new Error('Cloud save manifest is incomplete');
  const chunks = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const chunk = await getDoc(chunkDocument(user, generation, index));
    if (!chunk.exists()) throw new Error(`Cloud save chunk ${index + 1} is missing`);
    return chunk.data().data || '';
  }));
  if (control.cancelled) return;
  const text = chunks.join('');
  const snapshot = JSON.parse(text);
  if (snapshot.schema !== 1 || !Array.isArray(snapshot.databases)) throw new Error('Unsupported cloud save format');
  for (const database of snapshot.databases) {
    if (control.cancelled) return;
    if (isEaglerSaveDatabase(database.name)) await importDatabase(database);
  }
  localStorage.setItem(restoreKey, String(cloudTime || snapshot.savedAt || Date.now()));
  lastUploadedDigest = digest(text.replace(/"savedAt":\d+/, '"savedAt":0'));
  setStatus('Cloud save restored');
}

async function uploadToCloud() {
  if (!activeUser || !cloudEnabled()) return false;
  if (uploadInFlight) return uploadInFlight;
  uploadInFlight = (async () => {
    const snapshot = await createSnapshot();
    if (!snapshot.databases.length) {
      setStatus('No Eaglercraft worlds are available to save', true);
      return false;
    }
    const text = JSON.stringify(snapshot);
    const nextDigest = digest(text.replace(/"savedAt":\d+/, '"savedAt":0'));
    setStatus('Saving Eaglercraft worlds to cloud…');
    const chunks = [];
    for (let offset = 0; offset < text.length; offset += CHUNK_CHARACTERS) chunks.push(text.slice(offset, offset + CHUNK_CHARACTERS));
    const oldManifest = await getDoc(saveDocument(activeUser));
    const oldData = oldManifest.exists() ? oldManifest.data() : null;
    const generation = snapshot.savedAt.toString(36);
    await Promise.all(chunks.map((data, index) => setDoc(chunkDocument(activeUser, generation, index), { data })));
    await setDoc(saveDocument(activeUser), {
      schema: 1,
      client: clientKey(),
      savedAt: snapshot.savedAt,
      generation,
      chunkCount: chunks.length,
      digest: nextDigest
    });
    if (oldData?.generation && oldData.generation !== generation) {
      const oldCount = Math.max(0, Number(oldData.chunkCount) || 0);
      await Promise.all(Array.from({ length: oldCount }, (_, index) =>
        deleteDoc(chunkDocument(activeUser, oldData.generation, index)).catch(() => {})
      ));
    }
    lastUploadedDigest = nextDigest;
    localStorage.setItem(LAST_RESTORE_PREFIX + clientKey(), String(snapshot.savedAt));
    setStatus('Eaglercraft cloud save complete');
    return true;
  })().catch(error => {
    console.warn('Eaglercraft cloud save failed:', error);
    setStatus('Cloud save failed; worlds remain saved locally', true);
  }).finally(() => { uploadInFlight = null; });
  return uploadInFlight;
}

function waitForAuth() {
  return new Promise(resolve => {
    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(user);
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(null);
    }, 10000);
  });
}

export async function initializeEaglerCloudSave() {
  try {
    const user = await waitForAuth();
    if (!user) return;
    activeUser = user;
    try {
      await withTimeout(syncPreference(user), 5000, 'Cloud preference check timed out');
    } catch (error) {
      console.warn('Could not load the Eaglercraft cloud save preference:', error);
    }
    if (!cloudEnabled()) return;
    const pendingKey = PENDING_LOAD_PREFIX + clientKey();
    if (sessionStorage.getItem(pendingKey) === '1') {
      sessionStorage.removeItem(pendingKey);
      const restoreControl = { cancelled: false };
      try {
        await withTimeout(restoreFromCloud(user, restoreControl, true), 8000, 'Cloud restore timed out');
      } catch (error) {
        restoreControl.cancelled = true;
        console.warn('Eaglercraft cloud restore failed:', error);
        setStatus('Cloud restore unavailable; using local saves', true);
      } finally {
        sessionStorage.removeItem(pendingKey);
      }
    }
  } catch (error) {
    console.warn('Eaglercraft cloud save initialization failed:', error);
    setStatus('Cloud save unavailable; using local saves', true);
  }
}

window.KWEaglerCloudSaveNow = () => uploadToCloud();
window.KWEaglerCloudLoadNow = async () => {
  if (!activeUser || !cloudEnabled()) {
    setStatus('Cloud saves are disabled or you are signed out', true);
    return false;
  }
  try {
    const manifest = await getDoc(saveDocument(activeUser));
    if (!manifest.exists()) {
      setStatus('No cloud save exists for this Eaglercraft version', true);
      return false;
    }
    sessionStorage.setItem(PENDING_LOAD_PREFIX + clientKey(), '1');
    setStatus('Reloading to apply the cloud save…');
    setTimeout(() => location.reload(), 150);
    return true;
  } catch (error) {
    console.warn('Could not prepare Eaglercraft cloud restore:', error);
    setStatus('Could not load the cloud save', true);
    return false;
  }
};
