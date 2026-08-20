import { S, latest, toast, download } from './app-state.js';
import { saveManual } from './build-engine.js';
import { preparePreview } from './preview-tools.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { selectedId: '', previewing: false };

boot();

function boot(attempt = 0) {
  if (!$('#workspaceApp') || !$('#workspace-tab-code')) {
    if (attempt < 80) setTimeout(() => boot(attempt + 1), 50);
    return;
  }
  mount();
  wire();
  sync();
  window.addEventListener('appgpt-chat-changed', sync);
}

function mount() {
  if ($('#nightVersionLab')) return;
  const panel = document.createElement('section');
  panel.id = 'nightVersionLab';
  panel.className = 'night-version-lab';
  panel.innerHTML = `
    <div class="night-version-top">
      <div class="night-version-title"><strong>Version history</strong><span id="nightVersionCount">0 versions</span></div>
      <div class="night-version-nav">
        <button id="nightVersionOlder" title="Older version" aria-label="Older version">←</button>
        <select id="nightVersionSelect" aria-label="Choose saved version"></select>
        <button id="nightVersionNewer" title="Newer version" aria-label="Newer version">→</button>
      </div>
    </div>
    <div class="night-version-meta" id="nightVersionMeta">Generate an app to create version history.</div>
    <div class="night-version-stats" id="nightVersionStats"></div>
    <div class="night-version-diff" id="nightVersionDiff" hidden></div>
    <div class="night-version-actions">
      <button id="nightVersionLoad">Load in editor</button>
      <button id="nightVersionPreview">Preview version</button>
      <button id="nightVersionCompare">Compare to latest</button>
      <button id="nightVersionCopy">Copy</button>
      <button id="nightVersionDownload">Download</button>
      <button id="nightVersionRestore" class="night-version-primary">Restore as new version</button>
    </div>`;
  const code = $('.workspace-code-card');
  code?.insertAdjacentElement('beforebegin', panel);
}

function wire() {
  $('#nightVersionSelect').onchange = e => select(e.target.value);
  $('#nightVersionOlder').onclick = () => step(1);
  $('#nightVersionNewer').onclick = () => step(-1);
  $('#nightVersionLoad').onclick = loadEditor;
  $('#nightVersionPreview').onclick = previewSelected;
  $('#nightVersionCompare').onclick = compareSelected;
  $('#nightVersionCopy').onclick = copySelected;
  $('#nightVersionDownload').onclick = downloadSelected;
  $('#nightVersionRestore').onclick = restoreSelected;
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === '[') { e.preventDefault(); step(1); }
    if (e.key === ']') { e.preventDefault(); step(-1); }
  });
}

function artifacts() {
  return [...(S.chat?.artifacts || [])].sort((a,b) => (+b.version || 0) - (+a.version || 0));
}
function selected() {
  const list = artifacts();
  return list.find(a => a.id === state.selectedId) || list[0] || null;
}
function indexOfSelected() {
  const list = artifacts();
  const idx = list.findIndex(a => a.id === selected()?.id);
  return idx < 0 ? 0 : idx;
}

function sync() {
  const list = artifacts();
  if (!list.some(a => a.id === state.selectedId)) state.selectedId = list[0]?.id || '';
  render();
  if (state.previewing && !selected()) returnLatestPreview();
}

function render() {
  const list = artifacts(), sel = selected(), latestArtifact = latest();
  const selectEl = $('#nightVersionSelect');
  if (!selectEl) return;
  selectEl.innerHTML = list.length ? list.map(a => `<option value="${esc(a.id)}" ${a.id===sel?.id?'selected':''}>v${a.version}${a.id===latestArtifact?.id?' · latest':''}</option>`).join('') : '<option>No versions</option>';
  selectEl.disabled = !list.length;
  $('#nightVersionCount').textContent = `${list.length} version${list.length===1?'':'s'}`;
  $('#nightVersionOlder').disabled = !list.length || indexOfSelected() >= list.length - 1;
  $('#nightVersionNewer').disabled = !list.length || indexOfSelected() <= 0;
  $$('#nightVersionLab button:not(#nightVersionOlder):not(#nightVersionNewer)').forEach(b => b.disabled = !sel);
  if (!sel) {
    $('#nightVersionMeta').textContent = 'Generate an app to create version history.';
    $('#nightVersionStats').innerHTML = '';
    $('#nightVersionDiff').hidden = true;
    return;
  }
  const date = new Date(sel.createdAt || Date.now());
  $('#nightVersionMeta').textContent = `${sel.source || 'saved version'} · ${date.toLocaleString()} · ${formatBytes(sel.bytes || sel.content?.length || 0)}`;
  const stats = codeStats(sel.content || '');
  $('#nightVersionStats').innerHTML = [
    ['Lines',stats.lines],['Characters',stats.chars.toLocaleString()],['HTML tags',stats.tags],['Scripts',stats.scripts],['Styles',stats.styles]
  ].map(([k,v])=>`<span><b>${v}</b><em>${k}</em></span>`).join('');
  $('#nightVersionRestore').disabled = sel.id === latestArtifact?.id;
  $('#nightVersionCompare').disabled = !latestArtifact || sel.id === latestArtifact.id;
  $('#nightVersionPreview').textContent = state.previewing ? 'Return to latest' : 'Preview version';
}

function select(id) {
  state.selectedId = id;
  $('#nightVersionDiff').hidden = true;
  if (state.previewing) applyPreview();
  render();
}

function step(delta) {
  const list = artifacts(); if (!list.length) return;
  const next = Math.max(0, Math.min(list.length - 1, indexOfSelected() + delta));
  state.selectedId = list[next].id;
  $('#nightVersionDiff').hidden = true;
  if (state.previewing) applyPreview();
  render();
}

function isEditorDirty() {
  const editor = $('#workspaceCodeEditor'), current = latest();
  return !!editor && !!current && editor.value !== current.content;
}
function loadEditor() {
  const sel = selected(), editor = $('#workspaceCodeEditor'); if (!sel || !editor) return;
  if (isEditorDirty() && !confirm('You have unsaved code changes. Replace them with this saved version?')) return;
  editor.value = sel.content || '';
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus();
  toast(`Loaded v${sel.version} into the editor`);
}

function previewSelected() {
  if (state.previewing) return returnLatestPreview();
  if (!selected()) return;
  state.previewing = true;
  applyPreview();
  render();
  document.querySelector('[data-worktab="preview"]')?.click();
  toast(`Previewing v${selected().version}`);
}
function applyPreview() {
  const sel = selected(), frame = $('#previewFrame'); if (!sel || !frame) return;
  frame.srcdoc = preparePreview(sel.content || '', { visualEdit: false });
  let badge = $('#nightPreviewVersionBadge');
  if (!badge) {
    badge = document.createElement('div'); badge.id = 'nightPreviewVersionBadge'; badge.className = 'night-preview-version-badge';
    $('.workspace-tab-panel[data-panel="preview"] .preview-panel')?.prepend(badge);
  }
  badge.textContent = `Previewing saved v${sel.version} · not latest`;
  badge.hidden = false;
}
function returnLatestPreview() {
  state.previewing = false;
  const frame = $('#previewFrame'), cur = latest();
  if (frame) frame.srcdoc = cur ? preparePreview(cur.content || '', { visualEdit: false }) : '';
  const badge = $('#nightPreviewVersionBadge'); if (badge) badge.hidden = true;
  render();
  toast('Returned to latest preview');
}

function compareSelected() {
  const sel = selected(), cur = latest(); if (!sel || !cur || sel.id === cur.id) return;
  const a = lineDiff(sel.content || '', cur.content || '');
  const bytesDelta = (cur.content?.length || 0) - (sel.content?.length || 0);
  const box = $('#nightVersionDiff');
  box.innerHTML = `<strong>v${sel.version} → v${cur.version}</strong><span>+${a.added} added</span><span>−${a.removed} removed</span><span>${a.changed} changed</span><span>${bytesDelta>=0?'+':''}${formatBytesSigned(bytesDelta)}</span>`;
  box.hidden = false;
}

async function copySelected() {
  const sel = selected(); if (!sel) return;
  try { await navigator.clipboard.writeText(sel.content || ''); toast(`Copied v${sel.version}`); }
  catch { toast('Clipboard access was blocked'); }
}
function downloadSelected() {
  const sel = selected(); if (!sel) return;
  download(`index-v${sel.version}.html`, sel.content || '', 'text/html;charset=utf-8');
  toast(`Downloaded v${sel.version}`);
}
async function restoreSelected() {
  const sel = selected(), cur = latest(); if (!sel || sel.id === cur?.id) return;
  if (!confirm(`Restore v${sel.version} as a new current version? The existing history will be kept.`)) return;
  try {
    const saved = await saveManual(sel.content || '', `Restored from v${sel.version}`);
    state.selectedId = saved.id;
    state.previewing = false;
    render();
    toast(`Restored v${sel.version} as v${saved.version}`);
  } catch (e) { toast(e.message || 'Could not restore version'); }
}

function codeStats(code) {
  const text = String(code || '');
  return {
    lines: text ? text.split(/\r?\n/).length : 0,
    chars: text.length,
    tags: (text.match(/<\/?[a-z][^>]*>/gi) || []).length,
    scripts: (text.match(/<script\b/gi) || []).length,
    styles: (text.match(/<style\b/gi) || []).length
  };
}
function lineDiff(oldText, newText) {
  const A = String(oldText).split(/\r?\n/), B = String(newText).split(/\r?\n/);
  const aCounts = count(A), bCounts = count(B);
  let removed = 0, added = 0;
  for (const [line,n] of aCounts) removed += Math.max(0, n - (bCounts.get(line) || 0));
  for (const [line,n] of bCounts) added += Math.max(0, n - (aCounts.get(line) || 0));
  return { added, removed, changed: Math.min(added, removed) };
}
function count(lines) { const m = new Map(); for (const line of lines) m.set(line,(m.get(line)||0)+1); return m; }
function formatBytes(n) { n = Math.max(0, Number(n)||0); return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`; }
function formatBytesSigned(n) { const sign=n<0?'−':''; return sign+formatBytes(Math.abs(n)); }
function esc(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
