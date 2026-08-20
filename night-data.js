import { S, id, toast, download } from './app-state.js';
import { listChats, getChat, saveChat, setLastChatId } from './storage.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PIN_KEY = 'appgpt_pinned_chats_v1';
const SORT_KEY = 'appgpt_chat_sort_v1';
let pins = loadPins();
let sortMode = localStorage.getItem(SORT_KEY) || 'recent';
let cache = [];
let observer;

boot();

function boot(attempt = 0) {
  if (!$('#workspaceApp') || !$('#chatGrid')) {
    if (attempt < 80) setTimeout(() => boot(attempt + 1), 50);
    return;
  }
  mountSidebarTools();
  mountImportInput();
  wireCards();
  wireShortcuts();
  refresh();
  window.addEventListener('appgpt-chat-changed', refresh);
}

function loadPins() {
  try { return new Set(JSON.parse(localStorage.getItem(PIN_KEY) || '[]')); }
  catch { return new Set(); }
}
function savePins() {
  try { localStorage.setItem(PIN_KEY, JSON.stringify([...pins])); } catch {}
}

function mountSidebarTools() {
  const search = $('.workspace-search-wrap');
  if (!search || $('#nightChatTools')) return;
  const bar = document.createElement('div');
  bar.id = 'nightChatTools';
  bar.className = 'night-chat-tools';
  bar.innerHTML = `<select id="nightChatSort" aria-label="Sort chats">
    <option value="recent">Recent</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="status">Status</option>
  </select><button id="nightBackupChats" title="Backup all chats">⇩</button><button id="nightImportChats" title="Import chat or backup">⇧</button>`;
  search.insertAdjacentElement('afterend', bar);
  $('#nightChatSort').value = sortMode;
  $('#nightChatSort').onchange = e => { sortMode = e.target.value; localStorage.setItem(SORT_KEY, sortMode); sortCards(); };
  $('#nightBackupChats').onclick = backupAll;
  $('#nightImportChats').onclick = () => $('#nightChatImportInput')?.click();
}

function mountImportInput() {
  if ($('#nightChatImportInput')) return;
  const input = document.createElement('input');
  input.id = 'nightChatImportInput';
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.onchange = importFile;
  document.body.append(input);
}

function wireCards() {
  const grid = $('#chatGrid');
  observer = new MutationObserver(() => decorateCards());
  observer.observe(grid, { childList: true, subtree: true });
  decorateCards();
  grid.addEventListener('click', async e => {
    const b = e.target.closest('[data-night-chat]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const card = b.closest('.chat-card');
    const chatId = card?.querySelector('[data-chat][data-id]')?.dataset.id;
    if (!chatId) return;
    const action = b.dataset.nightChat;
    if (action === 'pin') togglePin(chatId);
    if (action === 'rename') await renameChat(chatId);
    if (action === 'duplicate') await duplicateChat(chatId);
    if (action === 'export') await exportChat(chatId);
  });
}

async function refresh() {
  cache = await listChats();
  pins = new Set([...pins].filter(x => cache.some(c => c.id === x)));
  savePins();
  decorateCards();
  sortCards();
  updateSummary();
}

function decorateCards() {
  $$('#chatGrid .chat-card').forEach(card => {
    const existing = card.querySelector('[data-chat][data-id]');
    const chatId = existing?.dataset.id;
    if (!chatId) return;
    card.dataset.chatId = chatId;
    card.classList.toggle('night-pinned-chat', pins.has(chatId));
    let actions = card.querySelector('.night-chat-card-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'night-chat-card-actions';
      actions.innerHTML = `<button data-night-chat="pin" title="Pin chat">☆</button><button data-night-chat="rename" title="Rename chat">✎</button><button data-night-chat="duplicate" title="Duplicate chat">⧉</button><button data-night-chat="export" title="Export chat">⇩</button>`;
      card.append(actions);
    }
    const pin = actions.querySelector('[data-night-chat="pin"]');
    if (pin) { pin.textContent = pins.has(chatId) ? '★' : '☆'; pin.setAttribute('aria-label', pins.has(chatId) ? 'Unpin chat' : 'Pin chat'); }
  });
}

function sortCards() {
  const grid = $('#chatGrid');
  if (!grid || !cache.length) return;
  const map = new Map(cache.map(c => [c.id, c]));
  const cards = $$('#chatGrid .chat-card');
  const compare = (a,b) => {
    const ap = pins.has(a.dataset.chatId), bp = pins.has(b.dataset.chatId);
    if (ap !== bp) return ap ? -1 : 1;
    const A = map.get(a.dataset.chatId) || {}, B = map.get(b.dataset.chatId) || {};
    if (sortMode === 'oldest') return new Date(A.updatedAt || 0) - new Date(B.updatedAt || 0);
    if (sortMode === 'name') return String(A.title || '').localeCompare(String(B.title || ''));
    if (sortMode === 'status') return String(A.status || '').localeCompare(String(B.status || '')) || new Date(B.updatedAt || 0)-new Date(A.updatedAt || 0);
    return new Date(B.updatedAt || 0) - new Date(A.updatedAt || 0);
  };
  cards.sort(compare).forEach(c => grid.append(c));
}

function updateSummary() {
  const foot = $('.workspace-sidebar-foot');
  if (!foot) return;
  let s = $('#nightChatSummary');
  if (!s) { s = document.createElement('span'); s.id = 'nightChatSummary'; s.className = 'night-chat-summary'; foot.append(s); }
  const files = cache.reduce((n,c)=>n+(c.artifacts?.length||0),0);
  s.textContent = `${cache.length} chat${cache.length===1?'':'s'} · ${files} file${files===1?'':'s'}`;
}

function togglePin(chatId) {
  pins.has(chatId) ? pins.delete(chatId) : pins.add(chatId);
  savePins(); decorateCards(); sortCards();
  toast(pins.has(chatId) ? 'Chat pinned' : 'Chat unpinned');
}

async function renameChat(chatId) {
  const chat = await getChat(chatId); if (!chat) return;
  const name = prompt('Rename chat', chat.title || 'Untitled');
  if (name == null) return;
  const next = name.trim(); if (!next || next === chat.title) return;
  chat.title = next; chat.updatedAt = new Date().toISOString();
  if (chat.project) chat.project.name = next;
  await saveChat(chat);
  if (S.chat?.id === chat.id) S.chat = chat;
  dispatchChanged(); toast('Chat renamed');
}

async function duplicateChat(chatId) {
  const chat = await getChat(chatId); if (!chat) return;
  const now = new Date().toISOString();
  const copy = clone(chat);
  copy.id = id(); copy.title = `${chat.title || 'Untitled'} copy`; copy.createdAt = now; copy.updatedAt = now; copy.status = chat.status === 'building' ? 'draft' : chat.status;
  copy.messages = (copy.messages || []).map(m => ({...m, id:id(), status:m.status==='building'?'ready':m.status}));
  copy.artifacts = (copy.artifacts || []).map(a => ({...a, id:id()}));
  if (copy.project?.latestArtifactId && copy.artifacts.length) copy.project.latestArtifactId = copy.artifacts.at(-1).id;
  await saveChat(copy); await setLastChatId(copy.id);
  dispatchChanged(); toast('Chat duplicated');
}

async function exportChat(chatId) {
  const chat = await getChat(chatId); if (!chat) return;
  const payload = { type:'appgpt-chat', version:1, exportedAt:new Date().toISOString(), chat };
  download(`${slug(chat.title || 'appgpt-chat')}.appgpt-chat.json`, JSON.stringify(payload,null,2), 'application/json');
  toast('Chat exported');
}

async function backupAll() {
  const chats = await listChats();
  const payload = { type:'appgpt-backup', version:1, exportedAt:new Date().toISOString(), chats };
  download(`appgpt-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload,null,2), 'application/json');
  toast(`Backed up ${chats.length} chat${chats.length===1?'':'s'}`);
}

async function importFile(e) {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let chats = [];
    if (data?.type === 'appgpt-chat' && data.chat) chats = [data.chat];
    else if (data?.type === 'appgpt-backup' && Array.isArray(data.chats)) chats = data.chats;
    else if (validChat(data)) chats = [data];
    else throw new Error('This is not an AppGPT chat or backup file.');
    let count = 0, first = null;
    for (const raw of chats) {
      if (!validChat(raw)) continue;
      const chat = clone(raw);
      if (await getChat(chat.id)) chat.id = id();
      chat.title = String(chat.title || 'Imported chat').slice(0,120);
      chat.createdAt ||= new Date().toISOString(); chat.updatedAt = new Date().toISOString();
      chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
      chat.artifacts = Array.isArray(chat.artifacts) ? chat.artifacts : [];
      await saveChat(chat); first ||= chat.id; count++;
    }
    if (!count) throw new Error('No valid chats were found in the file.');
    if (first) await setLastChatId(first);
    dispatchChanged(); toast(`Imported ${count} chat${count===1?'':'s'}`);
  } catch (err) { toast(err.message || 'Could not import backup'); }
  finally { e.target.value = ''; }
}

function validChat(c) { return c && typeof c === 'object' && typeof c.id === 'string' && (Array.isArray(c.messages) || Array.isArray(c.artifacts) || c.project); }
function dispatchChanged() { window.dispatchEvent(new CustomEvent('appgpt-chat-changed')); }
function clone(v){ try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))} }
function slug(v){ return String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'appgpt-chat'; }
function currentId(){ return S.chat?.id || ''; }

function wireShortcuts() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); currentId() && exportChat(currentId()); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); currentId() && duplicateChat(currentId()); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); currentId() && togglePin(currentId()); }
  });
}
