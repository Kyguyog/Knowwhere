/* KnowWhere shared login wall (external auth UI).
   Pages that already have a login page include this file and define
   window.KW_AUTH_OPTS before it, then set window.__kwSignIn (and
   window.__kwSignup for pages with sign-up). */
(function () {
  'use strict';

  var DEFAULT_ERRORS = {
    'auth/invalid-email': "That email address doesn't look right.",
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-disabled': 'This account has been disabled.'
  };

  var _opts = {};

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loginFormHTML() {
    var label = _opts.allowUsername ? 'Username or Email' : 'Email';
    var type = _opts.allowUsername ? 'text' : 'email';
    var placeholder = _opts.allowUsername ? 'username or you@example.com' : 'you@example.com';
    return '' +
      '<form autocomplete="on" class="auth-form" id="login-form-wrap" onsubmit="KWAuth.handleAuth(event);return false;">' +
        '<div class="auth-field"><label>' + esc(label) + '</label>' +
          '<input autocomplete="username email" id="auth-email" placeholder="' + esc(placeholder) + '" type="' + type + '"/></div>' +
        '<div class="auth-field"><label>Password</label>' +
          '<input autocomplete="current-password" id="auth-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" type="password"/></div>' +
        '<div class="auth-error" id="auth-error"></div>' +
        '<button class="auth-submit" id="auth-submit" type="submit">Login</button>' +
        (_opts.backMarkup || '') +
      '</form>';
  }

  function signupFormHTML() {
    return '' +
      '<form autocomplete="on" class="auth-form" id="signup-form-wrap" onsubmit="KWAuth.handleSignup(event);return false;" style="display:none;">' +
        '<div class="auth-field"><label>Full Name <span style="color:var(--muted);font-weight:400;font-size:0.65rem;">(First &amp; Last required)</span></label>' +
          '<input autocomplete="name" id="signup-fullname" placeholder="First Last" type="text"/></div>' +
        '<div class="auth-field"><label>Username</label>' +
          '<input autocomplete="username" id="signup-username" placeholder="e.g. Kyguy" type="text"/></div>' +
        '<div class="auth-field"><label>Email</label>' +
          '<input autocomplete="email" id="signup-email" placeholder="you@example.com" type="email"/></div>' +
        '<div class="auth-field"><label>Password</label>' +
          '<input autocomplete="new-password" id="signup-password" placeholder="Min 6 characters" type="password"/></div>' +
        '<div class="auth-field"><label>Confirm Password</label>' +
          '<input autocomplete="new-password" id="signup-confirm" placeholder="Passwords are stored in PLAINTEXT!" type="password"/></div>' +
        '<div class="auth-error" id="signup-error"></div>' +
        '<div id="signup-success" style="display:none;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.35);border-radius:6px;padding:0.9rem 1rem;color:#22c55e;font-size:0.85rem;line-height:1.5;text-align:center;"></div>' +
        '<button class="auth-submit" id="signup-submit" style="display:block;" type="submit">Request Access</button>' +
      '</form>';
  }

  function wallHTML() {
    if (_opts.mode === 'playtime') {
      return '<div class="auth-box"><div class="auth-title">KNOW<span>WHERE</span></div>' +
        '<form class="auth-form" onsubmit="KWAuth.handleAuth(event);return false;">' +
          '<input type="email" id="auth-email" autocomplete="email" placeholder="Email"/>' +
          '<input type="password" id="auth-password" autocomplete="current-password" placeholder="Password"/>' +
          '<div class="auth-error" id="auth-error"></div>' +
          '<button class="auth-submit" id="auth-submit" type="submit">Login</button>' +
        '</form></div>';
    }
    var logo = '<div class="auth-logo"><img alt="KnowWhere" src="KnowWhere-Logo-Trans.png"/><div class="auth-logo-name">KNOW<span>WHERE</span></div></div>';
    var subtitle = _opts.subtitle
      ? '<div style="font-family:var(--font-display);font-size:0.65rem;letter-spacing:0.2em;color:var(--secondary);text-transform:uppercase;margin-bottom:0.5rem;">' + esc(_opts.subtitle) + '</div>'
      : '';
    var tabs = _opts.signup
      ? '<div class="auth-tabs"><button class="auth-tab active" id="tab-login" onclick="KWAuth.switchTab(\'login\');return false;">Login</button><button class="auth-tab" id="tab-signup" onclick="KWAuth.switchTab(\'signup\');return false;">Sign Up</button></div>'
      : '';
    return '<div class="auth-box">' + logo + subtitle + tabs + loginFormHTML() + (_opts.signup ? signupFormHTML() : '') + '</div>';
  }

  function customError(code) {
    if (_opts.errors && _opts.errors[code]) return _opts.errors[code];
    return DEFAULT_ERRORS[code];
  }

  var KWAuth = {
    install: function (opts) {
      _opts = opts || {};
      var wall = el('auth-wall');
      if (!wall) return false;
      wall.innerHTML = wallHTML();
      wall.setAttribute('data-kw-built', '1');
      return true;
    },
    handleAuth: function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var emailEl = el('auth-email'), passEl = el('auth-password'), errEl = el('auth-error'), btn = el('auth-submit');
      var input = emailEl ? emailEl.value.trim() : '';
      var password = passEl ? passEl.value : '';
      if (errEl) errEl.classList.remove('show');
      if (!input || !password) {
        if (errEl) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.add('show'); }
        return false;
      }
      var signIn = window.__kwSignIn;
      if (typeof signIn !== 'function') {
        if (errEl) { errEl.textContent = 'Login is still loading. Please try again.'; errEl.classList.add('show'); }
        return false;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Logging in...'; }
      Promise.resolve().then(function () { return signIn(input, password); }).catch(function (err) {
        var code = err && err.code;
        var msg = customError(code) || (err && err.message) || 'Login failed.';
        if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
      });
      return false;
    },
    handleSignup: function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var submit = window.__kwSignup || window.handleSignupRequest;
      if (typeof submit === 'function') submit();
      return false;
    },
    switchTab: function (tab) {
      var tl = el('tab-login'), ts = el('tab-signup'), lw = el('login-form-wrap'), sw = el('signup-form-wrap');
      if (tl) tl.classList.toggle('active', tab === 'login');
      if (ts) ts.classList.toggle('active', tab === 'signup');
      if (lw) lw.style.display = tab === 'login' ? 'flex' : 'none';
      if (sw) sw.style.display = tab === 'signup' ? 'flex' : 'none';
      var ae = el('auth-error');
      if (ae) ae.classList.remove('show');
      if (window._retryCountdownInterval) { clearInterval(window._retryCountdownInterval); window._retryCountdownInterval = null; }
      return false;
    }
  };

  window.KWAuth = KWAuth;
  window.switchTab = KWAuth.switchTab;

  // Build the wall immediately so page modules can rely on its elements.
  if (!window.KW_AUTH_DISABLE_AUTO) {
    KWAuth.install(window.KW_AUTH_OPTS || {});
  }
})();
