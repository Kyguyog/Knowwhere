/* Forced new-tab cloak — shared by every root page (pages loaded only in an iframe self-exclude). */
(function () {
  /* True only when this page is the iframe inside a forced about:blank wrapper tab.
     Identified by the marker the wrapper writes on its own <html> element, with the
     kw-game iframe as a fallback for wrappers written by an older cached cloak.js.
     Never fires for the game popup, the zip player, or any other embed. */
  window.__kwInForcedTab = function () {
    try {
      if (window.self === window.top) return false;
      var topDoc = window.top.document;
      if (!topDoc) return false;
      var root = topDoc.documentElement;
      if (root && root.getAttribute && root.getAttribute('data-kw-cloak') === '1') return true;
      return !!topDoc.getElementById('kw-game');
    } catch (e) { return false; }
  };
  window.__kwForcedTab = window.__kwInForcedTab();

  var inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  if (inFrame) return;

  var STYLE_ID = 'kw-cloak-style';
  var OVERLAY_ID = 'kw-cloak-overlay';
  if (document.getElementById(OVERLAY_ID)) return;

  var CSS = [
    '#kw-cloak-overlay{position:fixed;inset:0;z-index:99999;background:var(--bg,#0a0a0f);display:flex;align-items:center;justify-content:center;padding:1rem;}',
    '#kw-cloak-overlay.hidden{display:none;}',
    '.kw-cloak-box{background:var(--card,#111118);border:1px solid var(--border,#2a2a35);border-radius:14px;padding:2.5rem 2rem;width:100%;max-width:440px;text-align:center;box-shadow:0 0 60px rgba(168,85,247,.15);display:flex;flex-direction:column;align-items:center;gap:1.25rem;}',
    '.kw-cloak-box img{width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(168,85,247,.8));}',
    '.kw-cloak-title{font-family:var(--font-display,inherit);font-size:1.3rem;font-weight:900;letter-spacing:.05em;}',
    '.kw-cloak-title span{color:var(--primary,#a855f7);}',
    '.kw-cloak-sub{color:var(--muted,#8b8b9e);font-size:.9rem;line-height:1.5;}',
    '.kw-cloak-count{font-family:var(--font-display,inherit);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--secondary,#5b5b6b);}',
    '.kw-cloak-btn{width:100%;padding:.85rem;background:var(--primary,#a855f7);color:#fff;border:none;border-radius:6px;font-family:var(--font-display,inherit);font-size:.7rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;box-shadow:0 0 20px rgba(168,85,247,.35);transition:transform .15s,box-shadow .15s;}',
    '.kw-cloak-btn:hover{transform:scale(1.02);box-shadow:0 0 32px rgba(168,85,247,.6);}',
    '.kw-cloak-status{color:var(--danger,#ef4444);font-size:.8rem;min-height:1.2em;}'
  ].join('\n');

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="kw-cloak-box">' +
      '<img alt="" src="KnowWhere-Logo-Trans.png">' +
      '<div class="kw-cloak-title">KNOW<span>WHERE</span></div>' +
      '<p class="kw-cloak-sub">Open the site in a <strong>new tab</strong> for the best experience.</p>' +
      '<div class="kw-cloak-count" id="kw-cloak-count">Opening automatically in 10s…</div>' +
      '<button class="kw-cloak-btn" id="kw-cloak-btn">Open in New Tab</button>' +
      '<div class="kw-cloak-status" id="kw-cloak-status"></div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function __kwGetTabConfig() {
    var cfg = null;
    try {
      var raw = localStorage.getItem('kw_tab_config');
      if (raw) { var p = JSON.parse(raw); if (p && p.name) cfg = p; }
    } catch (e) {}
    return cfg;
  }
  function __kwApplySkippedTab() {
    var orig = document.getElementById('kw-orig-title');
    if (!orig) { orig = document.createElement('meta'); orig.id = 'kw-orig-title'; document.head.appendChild(orig); }
    if (!orig.getAttribute('content')) orig.setAttribute('content', document.title || '');
    var cfg = __kwGetTabConfig();
    var tabName = (cfg && cfg.name) ? String(cfg.name) : 'My Apps';
    var tabIcon = (cfg && cfg.icon) ? String(cfg.icon) : 'https://myapps.classlink.com/favicon.ico';
    document.title = tabName;
    var fv = document.querySelector('link[rel="icon"]');
    if (!fv) { fv = document.createElement('link'); fv.rel = 'icon'; document.head.appendChild(fv); }
    if (!fv.getAttribute('data-kw-og')) fv.setAttribute('data-kw-og', fv.getAttribute('href') || '');
    fv.href = tabIcon;
  }

  function cloakStatus(msg) {
    var el = document.getElementById('kw-cloak-status');
    if (el) el.textContent = msg || '';
  }

  function __kwCloakNow() {
    cloakStatus('');
    var w = null;
    var kwIf = null;
    try {
      w = window.open('about:blank', '_blank');
    } catch (e) { w = null; }
    if (!w) {
      cloakStatus('Popup blocked — click the button again to continue.');
      return false;
    }
    try { w.focus(); } catch (e) {}
    try {
      var src = window.location.href;
      var safeTitle = String(document.title || '');
      var _kwCfg = __kwGetTabConfig();
      if (_kwCfg && _kwCfg.name) safeTitle = String(_kwCfg.name);
      var safeSrc = String(src).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      w.document.write('<!DOCTYPE html><html data-kw-cloak="1"><head><meta charset="utf-8"><title>' + safeTitle + '</title><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000;}iframe{position:fixed;top:0;left:0;width:100vw;height:100vh;border:0;display:block;background:#000;}</style></head><body><iframe id="kw-game" src="' + safeSrc + '" allowfullscreen referrerpolicy="no-referrer"></iframe></body></html>');
      w.document.close();
      try { kwIf = w.document.getElementById('kw-game'); } catch (e2) { kwIf = null; }
    } catch (e) {}
    try { w.focus(); } catch (e) {}
    try { if (kwIf) kwIf.focus(); } catch (e) {}
    var redirectUrl = 'https://google.com';
    try {
      var _kwPresets = null;
      try {
        var _kp = localStorage.getItem('kw_redirect_presets');
        if (_kp) { var _parsed = JSON.parse(_kp); if (Array.isArray(_parsed) && _parsed.length) _kwPresets = _parsed; }
      } catch (e2) {}
      if (!_kwPresets) _kwPresets = ['https://google.com', 'https://classroom.google.com', 'https://canvas.instructure.com', 'https://www.desmos.com', 'https://www.khanacademy.org', 'https://www.youtube.com'];
      redirectUrl = _kwPresets[Math.floor(Math.random() * _kwPresets.length)];
    } catch (e) {}
    try { window.location.replace(redirectUrl); } catch (e) {}
    [350, 1200, 3000, 6000].forEach(function (ms) {
      setTimeout(function () { try { w.focus(); if (kwIf) kwIf.focus(); } catch (e) {} }, ms);
    });
    return true;
  }

  function __kwCloakSkip() {
    try { localStorage.setItem('kw_cloak_skip', String(Date.now())); } catch (e) {}
    __kwApplySkippedTab();
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.add('hidden');
    if (window._kwCloakTimer) { clearInterval(window._kwCloakTimer); window._kwCloakTimer = null; }
  }

  window.__kwGetTabConfig = __kwGetTabConfig;
  window.__kwApplySkippedTab = __kwApplySkippedTab;
  window.__kwCloakNow = __kwCloakNow;
  window.__kwCloakSkip = __kwCloakSkip;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (window.__kwCloakInit) window.__kwCloakInit(); });
  } else {
    inject();
  }

  window.__kwCloakInit = function () {
    inject();
    var overlayEl = document.getElementById(OVERLAY_ID);
    var skipTs = 0;
    try { skipTs = parseInt(localStorage.getItem('kw_cloak_skip'), 10) || 0; } catch (e) {}
    if (skipTs && Date.now() - skipTs < 3600000) {
      if (overlayEl) overlayEl.classList.add('hidden');
      __kwApplySkippedTab();
      return;
    }
    if (skipTs) { try { localStorage.removeItem('kw_cloak_skip'); } catch (e) {} }
    __kwApplySkippedTab();
    var isChromebook = false;
    try {
      if (navigator.userAgentData && navigator.userAgentData.platform) isChromebook = navigator.userAgentData.platform === 'ChromeOS';
    } catch (e) {}
    if (!isChromebook && /CrOS/.test(navigator.userAgent)) isChromebook = true;
    if (isChromebook) {
      if (overlayEl) overlayEl.classList.add('hidden');
      return;
    }
    var btn = document.getElementById('kw-cloak-btn');
    if (btn) btn.addEventListener('click', function () { __kwCloakNow(); });
    var seconds = 10;
    var counter = document.getElementById('kw-cloak-count');
    window._kwCloakTimer = setInterval(function () {
      seconds--;
      if (counter) counter.textContent = 'Opening automatically in ' + seconds + 's…';
      if (seconds <= 0) {
        clearInterval(window._kwCloakTimer);
        window._kwCloakTimer = null;
        if (!__kwCloakNow()) {
          cloakStatus('Auto-open was blocked. Click the button to continue.');
          if (counter) counter.textContent = '';
        }
      }
    }, 1000);
  };

  var _kwBuffer = '';
  window.addEventListener('keydown', function (e) {
    if (!e.key || e.key.length !== 1) return;
    _kwBuffer = (_kwBuffer + e.key.toLowerCase()).slice(-8);
    if (_kwBuffer.indexOf('skip') > -1) __kwCloakSkip();
  });
})();
