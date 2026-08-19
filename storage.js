const DB_NAME = "AppGPTDB";
const DB_VERSION = 1;
const STORE = "chats";
const LS_FALLBACK = "appgpt_chats_fallback";
const LAST_CHAT_KEY = "appgpt_last_chat";
const API_KEY_KEY = "appgpt_provider_key";

const tg = window.Telegram?.WebApp;
const supportsV9 = !!tg?.isVersionAtLeast?.("9.0");

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open local database"));
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (e) { db.close(); reject(e); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Storage transaction failed")); };
  });
}

function fallbackChats() {
  try { return JSON.parse(localStorage.getItem(LS_FALLBACK) || "[]"); } catch { return []; }
}
function saveFallbackChats(chats) { localStorage.setItem(LS_FALLBACK, JSON.stringify(chats)); }

export async function saveChat(chat) {
  const copy = structuredCloneSafe(chat);
  try { await withStore("readwrite", store => store.put(copy)); }
  catch {
    const chats = fallbackChats();
    const i = chats.findIndex(x => x.id === copy.id);
    if (i >= 0) chats[i] = copy; else chats.unshift(copy);
    saveFallbackChats(chats.slice(0, 40));
  }
  await setLastChatId(copy.id);
  return copy;
}

export async function getChat(id) {
  if (!id) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch { return fallbackChats().find(x => x.id === id) || null; }
}

export async function listChats() {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
    return rows.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch { return fallbackChats().sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
}

export async function deleteChat(id) {
  try { await withStore("readwrite", store => store.delete(id)); }
  catch { saveFallbackChats(fallbackChats().filter(x => x.id !== id)); }
  const last = await getLastChatId();
  if (last === id) await setLastChatId("");
}

export async function setLastChatId(id) {
  localStorage.setItem(LAST_CHAT_KEY, id || "");
  if (supportsV9 && tg?.DeviceStorage?.setItem) {
    try { await tgDevice("setItem", LAST_CHAT_KEY, id || ""); } catch {}
  }
}

export async function getLastChatId() {
  if (supportsV9 && tg?.DeviceStorage?.getItem) {
    try {
      const value = await tgDevice("getItem", LAST_CHAT_KEY);
      if (value) return value;
    } catch {}
  }
  return localStorage.getItem(LAST_CHAT_KEY) || "";
}

export async function saveApiKey(key, remember) {
  sessionStorage.setItem(API_KEY_KEY, key || "");
  if (!remember) {
    localStorage.removeItem(API_KEY_KEY);
    if (supportsV9 && tg?.SecureStorage?.removeItem) {
      try { await tgSecure("removeItem", API_KEY_KEY); } catch {}
    }
    return;
  }
  if (supportsV9 && tg?.SecureStorage?.setItem) {
    try {
      await tgSecure("setItem", API_KEY_KEY, key || "");
      localStorage.removeItem(API_KEY_KEY);
      return;
    } catch {}
  }
  localStorage.setItem(API_KEY_KEY, key || "");
}

export async function loadApiKey() {
  const session = sessionStorage.getItem(API_KEY_KEY);
  if (session) return { key: session, remembered: false };
  if (supportsV9 && tg?.SecureStorage?.getItem) {
    try {
      const value = await tgSecure("getItem", API_KEY_KEY);
      if (value) return { key: value, remembered: true };
    } catch {}
  }
  const local = localStorage.getItem(API_KEY_KEY) || "";
  return { key: local, remembered: Boolean(local) };
}

function tgDevice(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      tg.DeviceStorage[method](...args, (err, value) => err ? reject(new Error(String(err))) : resolve(value));
    } catch (e) { reject(e); }
  });
}
function tgSecure(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      tg.SecureStorage[method](...args, (err, value) => err ? reject(new Error(String(err))) : resolve(value));
    } catch (e) { reject(e); }
  });
}
function structuredCloneSafe(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}
