const THEME_KEY = 'appgpt_theme';
const APPEARANCE_CSS = './appearance.css';
const LIQUID_GL_URL = 'https://cdn.jsdelivr.net/npm/liquid-gl@2.0.1/liquidGL.js';
const HF_MODELS = [
  'Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest',
  'openai/gpt-oss-120b:fastest',
  'deepseek-ai/DeepSeek-R1:fastest',
  'Qwen/Qwen2.5-Coder-32B-Instruct:fastest',
  'Qwen/Qwen3-4B-Thinking-2507:fastest',
  'Qwen/Qwen2.5-7B-Instruct-1M:fastest',
  'google/gemma-2-2b-it:fastest',
  'zai-org/GLM-4.5V:fastest',
  'Qwen/Qwen2.5-VL-3B-Instruct:fastest'
];
const VALID_VIEWS = new Set(['build','chats','templates','debug','publish','settings']);
const root = document.documentElement;
const tg = window.Telegram?.WebApp;
let liquidReady = false;
let liquidInstance = null;

init();

function init() {
  loadAppearanceCss();
  markLiquidSurfaces();
  mountDock();
  setupProviderModels();
  openRequestedView();
  applyTheme(readTheme(), false);
  if (document.readyState === 'complete') initLiquidGL();
  else window.addEventListener('load', () => initLiquidGL(), { once: true });
  window.addEventListener('appgpt-chat-changed', recaptureSoon);
}

function loadAppearanceCss() {
  if (document.querySelector('link[data-appgpt-appearance]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = APPEARANCE_CSS;
  link.dataset.appgptAppearance = 'true';
  document.head.append(link);
}

function markLiquidSurfaces() {
  document.querySelectorAll('.sidebar.glass, .panel.glass, .app-sheet.glass').forEach(element => {
    element.classList.add('liquidGL');
  });
}

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

function openRequestedView() {
  let requested = '';
  try { requested = new URL(location.href).searchParams.get('view') || ''; } catch {}
  if (!VALID_VIEWS.has(requested) || requested === 'build') return;
  let attempts = 0;
  const tryOpen = () => {
    const button = document.querySelector(`.nav-item[data-view="${requested}"]`);
    if (button && typeof button.onclick === 'function') {
      button.click();
      return;
    }
    if (++attempts < 30) setTimeout(tryOpen, 80);
  };
  setTimeout(tryOpen, 0);
}

function setupProviderModels() {
  const provider = document.getElementById('providerSelect');
  const model = document.getElementById('modelInput');
  if (!provider || !model) return;

  let list = document.getElementById('appgptModelSuggestions');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'appgptModelSuggestions';
    document.body.append(list);
  }
  model.setAttribute('list', list.id);

  let hint = document.getElementById('providerModelHint');
  if (!hint) {
    hint = document.createElement('span');
    hint.id = 'providerModelHint';
    hint.className = 'provider-model-hint';
    model.insertAdjacentElement('afterend', hint);
  }

  const refresh = () => {
    const isHF = provider.value === 'huggingface';
    list.innerHTML = (isHF ? HF_MODELS : []).map(value => `<option value="${escapeAttr(value)}"></option>`).join('');
    hint.textContent = isHF
      ? 'Hugging Face: choose a suggested model or type any chat-capable model ID. Add :fastest, :cheapest, or :preferred to control routing.'
      : '';
    hint.hidden = !isHF;
  };
  provider.addEventListener('change', () => setTimeout(refresh, 0));
  new MutationObserver(refresh).observe(provider, { childList: true });
  refresh();
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char]));
}

function mountDock() {
  if (document.getElementById('liquidDock')) return;
  const dock = document.createElement('div');
  dock.id = 'liquidDock';
  dock.className = 'liquid-dock liquidGL';
  dock.setAttribute('aria-label', 'AppGPT quick controls');

  const content = document.createElement('div');
  content.className = 'liquid-content';

  const existingActions = document.querySelector('.top-actions');
  if (existingActions) content.append(existingActions);

  const theme = document.createElement('button');
  theme.id = 'themeToggleBtn';
  theme.className = 'theme-toggle';
  theme.type = 'button';
  theme.innerHTML = '<span class="theme-icon" aria-hidden="true">☾</span><span class="theme-label">Dark</span>';
  theme.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
    try { tg?.HapticFeedback?.selectionChanged?.(); } catch {}
  });
  content.append(theme);

  const badge = document.createElement('span');
  badge.id = 'liquidGlBadge';
  badge.className = 'liquid-badge';
  badge.dataset.state = 'loading';
  badge.innerHTML = '<i></i><span>LiquidGL</span>';
  content.append(badge);

  dock.append(content);
  document.body.append(dock);
}

function applyTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = next;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'light' ? '#edf3fb' : '#070b14';

  const button = document.getElementById('themeToggleBtn');
  if (button) {
    button.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    button.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
    const icon = button.querySelector('.theme-icon');
    const label = button.querySelector('.theme-label');
    if (icon) icon.textContent = next === 'light' ? '☀' : '☾';
    if (label) label.textContent = next === 'light' ? 'Light' : 'Dark';
  }

  try {
    const bg = next === 'light' ? '#edf3fb' : '#070b14';
    tg?.setHeaderColor?.(bg);
    tg?.setBackgroundColor?.(bg);
    tg?.setBottomBarColor?.(bg);
  } catch {}

  recaptureSoon();
}

async function initLiquidGL() {
  const badge = document.getElementById('liquidGlBadge');
  try {
    const module = await import(LIQUID_GL_URL);
    const liquidGL = module.default;
    if (typeof liquidGL !== 'function') throw new Error('liquidGL did not load correctly');

    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    liquidInstance = liquidGL({
      snapshot: 'body',
      target: '.liquidGL',
      resolution: Math.min(1.45, Math.max(1, (window.devicePixelRatio || 1) * 0.72)),
      refraction: 0.014,
      aberration: 0.025,
      bevelDepth: 0.07,
      bevelWidth: 0.15,
      frost: root.dataset.theme === 'light' ? 0.65 : 1.05,
      shadow: true,
      specular: !reduced,
      reveal: reduced ? 'none' : 'fade',
      tilt: false,
      magnify: 1.006,
      on: {
        init() {
          liquidReady = true;
          if (badge) badge.dataset.state = 'ready';
        }
      }
    });
    if (badge && !liquidReady) badge.dataset.state = 'loading';
  } catch (error) {
    console.warn('LiquidGL unavailable; CSS glass fallback is active.', error);
    if (badge) {
      badge.dataset.state = 'fallback';
      const label = badge.querySelector('span');
      if (label) label.textContent = 'Glass fallback';
    }
  }
}

function recaptureSoon() {
  clearTimeout(recaptureSoon.timer);
  recaptureSoon.timer = setTimeout(() => {
    try {
      const renderer = window.__liquidGLRenderer__;
      renderer?.captureSnapshot?.();
      renderer?.render?.();
    } catch {}
  }, 80);
}

export function getAppearanceState() {
  return { theme: root.dataset.theme || 'dark', liquidReady, liquidInstance };
}
