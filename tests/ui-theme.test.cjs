const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const userMenu = fs.readFileSync(path.join(root, 'js/user-menu.js'), 'utf8');

test('a delayed account preference load cannot overwrite a newer UI selection', () => {
  assert.match(userMenu, /var startedAtUiRevision=uiPreferenceRevision/);
  assert.match(userMenu, /if\(startedAtUiRevision===uiPreferenceRevision\)/);
  assert.match(userMenu, /window\.setUiTheme=async function\(theme\)\{[\s\S]*?uiPreferenceRevision\+\+/);
  assert.match(userMenu, /window\.toggleLiquidGlass=async function\(\)\{[\s\S]*?uiPreferenceRevision\+\+/);
});

test('UI changes synchronize to other open windows and all pages load the fixed script', () => {
  assert.match(userMenu, /event\.key==='kw_ui_theme'/);
  assert.match(userMenu, /event\.key==='kw_liquid_glass'/);

  const pages = ['404.html', 'admin.html', 'bugs.html', 'edit.html', 'graveyard.html', 'index.html', 'msg.html', 'playtime.html', 'staff.html', 'tos.html', 'updates.html', 'user.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /\/js\/user-menu\.js\?v=25/, `${page} should bypass the old cached UI script`);
  }
});
