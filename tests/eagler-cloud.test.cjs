const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cloudSource = fs.readFileSync(path.join(root, 'js/eagler-cloud-save.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('Eaglercraft cloud saves and loads only through manual controls', () => {
  assert.match(indexSource, /id="game-popup-cloud-save"/);
  assert.match(indexSource, /id="game-popup-cloud-load"/);
  assert.match(cloudSource, /window\.KWEaglerCloudSaveNow/);
  assert.match(cloudSource, /window\.KWEaglerCloudLoadNow/);
  assert.match(cloudSource, /PlatformFilesystem/);
  assert.doesNotMatch(cloudSource, /setInterval\s*\(/);
  assert.doesNotMatch(cloudSource, /visibilitychange|pagehide/);
});

test('all bundled Eaglercraft clients wait for a requested restore before booting', () => {
  const clients = [
    'Games/Eaglercraft/Eaglercraft_1.12.2_JS/Eaglercraft_1.12.2_JS.html',
    'Games/Eaglercraft/Eaglercraft_1.12.2_WASM/Eaglercraft_1.12.2_WASM.html',
    'Games/Eaglercraft/Eaglercraft_1.8_Shaders/EaglercraftX_1.8_WASM_Shaders.html',
    'Games/Eaglercraft/Tuff/Tuff_Client_WASM.html'
  ];
  for (const client of clients) {
    const source = fs.readFileSync(path.join(root, client), 'utf8');
    assert.match(source, /eagler-cloud-bootstrap\.js/, client);
    assert.match(source, /await window\.KWEaglerCloud\.ready/, client);
  }
});
