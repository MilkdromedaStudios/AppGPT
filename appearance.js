const THEME_KEY = 'appgpt_theme';
const LIQUID_GL_URL = 'https://cdn.jsdelivr.net/npm/liquid-gl@2.0.1/liquidGL.js';
const root = document.documentElement;
const tg = window.Telegram?.WebApp;
let liquidReady = false;
let liquidInstance = null;

init();

function init() {
  mountDock();
  applyTheme(readTheme(), false);
  window.addEventListener('load', () => initLiquidGL(), { once: true });
  window.addEventListener('appgpt-chat-changed', recaptureSoon);
}

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
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

    const reduced = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    liquidInstance = liquidGL({
      snapshot: 'body',
      target: '.liquidGL',
      resolution: Math.min(1.6, Math.max(1, (window.devicePixelRatio || 1) * 0.8)),
      refraction: 0.018,
      aberration: 0.035,
      bevelDepth: 0.075,
      bevelWidth: 0.16,
      frost: root.dataset.theme === 'light' ? 0.8 : 1.2,
      shadow: true,
      specular: !reduced,
      reveal: reduced ? 'none' : 'fade',
      tilt: false,
      magnify: 1.01,
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
