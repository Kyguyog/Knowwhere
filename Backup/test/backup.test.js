import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { Engine, validateSettings, validateBackup } from '../src/engine.js';
import { Firestore } from '../src/firestore.js';
import { Storage } from '../src/storage.js';
import { createApp } from '../src/server.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const credentials = { type: 'service_account', project_id: 'sample-project', client_email: 'backup@sample-project.iam.gserviceaccount.com', private_key: privateKey };
const config = { serviceAccount: credentials, projectId: 'sample-project', databaseId: '(default)', intervalValue: 1, intervalUnit: 'days', retention: 100, enabled: true };
const typedFields = {
  large: { integerValue: '9223372036854775807' }, negative: { integerValue: '-9223372036854775808' },
  time: { timestampValue: '2026-10-20T12:01:02.123456789Z' }, data: { bytesValue: 'AAEC/w==' },
  ref: { referenceValue: 'projects/sample-project/databases/(default)/documents/people/a' },
  point: { geoPointValue: { latitude: 40.7, longitude: -74 } }, infinity: { doubleValue: 'Infinity' }, nan: { doubleValue: 'NaN' },
  nested: { mapValue: { fields: { list: { arrayValue: { values: [{ nullValue: null }, { booleanValue: false }, { stringValue: '☃' }] } } } } },
};

class FakeDatabase {
  constructor() { this.docs = new Map([['people/a', typedFields], ['people/missing/children/b', {}]]); this.writes = []; }
  async test() { if (this.failTest) throw new Error('Connection failed'); }
  async *documents() {
    for (const [path, fields] of this.docs) {
      if (this.failRead) throw new Error('Simulated read failure');
      yield { path, fields: structuredClone(fields) };
    }
  }
  async apply(records, operation, progress) {
    let count = 0;
    for await (const record of records) {
      this.writes.push({ operation, path: record.path });
      if (operation === 'update' && this.failWrite) throw new Error('Simulated write failure');
      if (operation === 'delete') this.docs.delete(record.path);
      else this.docs.set(record.path, structuredClone(record.fields));
      progress(++count);
    }
    return count;
  }
}
async function fixture(t, retention = 100) {
  const dir = await mkdtemp(join(tmpdir(), 'fsbak-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const db = new FakeDatabase(), storage = new Storage(dir), engine = new Engine(storage, () => db);
  await engine.init(); await engine.configure({ ...config, retention });
  return { dir, db, storage, engine };
}
async function backup(engine) { await engine.startJob('manual'); await engine.task; assert.equal(engine.state.lastJob.status, 'completed'); return engine.state.lastJob.result; }

test('backup/restore preserves all typed values, nested and empty documents, and removes newer documents', async t => {
  const { engine, db } = await fixture(t);
  const original = structuredClone([...db.docs]);
  const saved = await backup(engine);
  db.docs.set('people/a', { changed: { stringValue: 'later' } }); db.docs.set('new/c', {});
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'completed');
  assert.deepEqual([...db.docs], original);
  const safety = (await engine.list()).find(b => b.kind === 'safety');
  assert.equal(safety.count, 3);
  assert.ok((await readFile(engine.file(safety.id), 'utf8')).includes('new/c'));
});

test('retention=1 keeps safety backup after successful restore without deleting the restore source early', async t => {
  const { engine, db } = await fixture(t, 1);
  const saved = await backup(engine);
  db.docs.set('new/c', {});
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'completed');
  const remaining = await engine.list();
  assert.equal(remaining.length, 1); assert.equal(remaining[0].kind, 'safety');
  assert.equal(db.docs.has('new/c'), false);
});

test('a corrupted backup aborts before safety capture or database writes', async t => {
  const { engine, db } = await fixture(t);
  const saved = await backup(engine), path = engine.file(saved.id);
  await writeFile(path, (await readFile(path, 'utf8')).replace('9223372036854775807', '9223372036854775806'));
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'failed');
  assert.match(engine.state.lastJob.error, /checksum/);
  assert.equal(db.writes.length, 0); assert.equal((await engine.list()).length, 1);
});

test('safety backup failure makes no writes and publishes no partial backup', async t => {
  const { engine, db, storage } = await fixture(t);
  const saved = await backup(engine); db.failRead = true;
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'failed'); assert.equal(db.writes.length, 0);
  assert.equal((await engine.list()).length, 1);
  assert.equal((await readdir(storage.backups)).some(name => name.endsWith('.partial')), false);
});

test('partial restore failure protects source and safety even with retention=1, survives restart, and blocks schedules', async t => {
  const { engine, db, dir } = await fixture(t, 1);
  const saved = await backup(engine); db.failWrite = true;
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'failed');
  assert.equal((await engine.list()).filter(b => b.protected).length, 2);
  const restarted = new Engine(new Storage(dir), () => db); await restarted.init();
  assert.ok(restarted.state.recovery.safetyId);
  await restarted.tick(Date.now() + 864000000); assert.equal(restarted.active, null);
  await assert.rejects(() => restarted.startJob('manual'), /needs attention/);
  db.failWrite = false;
  await restarted.startJob('restore', saved.id); await restarted.task;
  assert.equal(restarted.state.lastJob.status, 'completed'); assert.equal(restarted.state.recovery, undefined);
  assert.deepEqual(db.docs.get('people/a'), typedFields);
});

test('startup reports interrupted jobs and retains restore recovery state', async t => {
  const { engine, storage, dir } = await fixture(t);
  engine.state.active = { type: 'restore', id: 'interrupted', startedAt: new Date().toISOString() };
  engine.state.recovery = { ids: ['protected'], safetyId: 'protected' }; await storage.saveState(engine.state);
  const restarted = new Engine(new Storage(dir)); await restarted.init();
  assert.equal(restarted.state.lastJob.status, 'failed'); assert.match(restarted.state.lastJob.error, /Container stopped/);
  assert.equal(restarted.state.recovery.safetyId, 'protected');
});

test('scheduler persists due time, catches up once after restart, and excludes overlapping jobs', async t => {
  const { engine, db, dir } = await fixture(t);
  engine.state.nextAt = new Date(Date.now() - 1000).toISOString(); await engine.persist();
  const restarted = new Engine(new Storage(dir), () => db); await restarted.init();
  assert.equal(restarted.state.nextAt, engine.state.nextAt);
  await restarted.tick(); await assert.rejects(() => restarted.startJob('manual'), /Another job/);
  await restarted.task;
  assert.equal(restarted.state.lastJob.type, 'scheduled'); assert.ok(Date.parse(restarted.state.nextAt) > Date.now());
  await restarted.tick(); assert.equal((await restarted.list()).length, 1);
});

test('retention is enforced, invalid settings rejected, secrets encrypted and omitted from public status', async t => {
  const { engine, dir } = await fixture(t, 2);
  await backup(engine); await backup(engine); await backup(engine);
  assert.equal((await engine.list()).length, 2);
  assert.ok(!(await readFile(join(dir, 'config.json'), 'utf8')).includes('PRIVATE KEY'));
  assert.ok(!JSON.stringify(await engine.status()).includes('private_key'));
  assert.equal((await new Storage(dir).state()).lastJob.status, 'completed');
  for (const retention of [0, 1001, 1.5, '10']) assert.throws(() => validateSettings({ ...config, retention }));
  assert.throws(() => validateSettings({ ...config, intervalValue: 0 }));
  assert.throws(() => validateSettings({ ...config, intervalUnit: '__proto__' }));
  await assert.rejects(() => engine.configure({ ...config, serviceAccount: { apiKey: 'web-config' } }), /service-account/);
});

test('REST traversal paginates collections and documents and descends through missing parents', async () => {
  const calls = [], root = 'projects/sample-project/databases/(default)/documents';
  const db = new Firestore(config, async (method, path, body, query) => {
    calls.push({ method, path, body, query });
    if (path === `${root}:listCollectionIds`) return body.pageToken ? { collectionIds: ['empty'] } : { collectionIds: ['parents'], nextPageToken: 'collections-next' };
    if (path === `${root}/parents`) return query.pageToken ? { documents: [{ name: `${root}/parents/real`, createTime: 'now', fields: {} }] } : { documents: [{ name: `${root}/parents/missing` }], nextPageToken: 'docs-next' };
    if (path === `${root}/parents/missing:listCollectionIds`) return { collectionIds: ['children'] };
    if (path === `${root}/parents/missing/children`) return { documents: [{ name: `${root}/parents/missing/children/a`, createTime: 'now', fields: typedFields }] };
    return {};
  });
  const result = [];
  for await (const document of db.documents()) result.push(document);
  assert.deepEqual(result.map(d => d.path), ['parents/missing/children/a', 'parents/real']);
  assert.deepEqual(result[0].fields, typedFields);
  assert.ok(calls.some(c => c.query?.pageToken === 'docs-next' && c.query.showMissing));
  assert.ok(calls.some(c => c.body?.pageToken === 'collections-next'));
});

test('REST commits split below write/size limits and replace full documents', async () => {
  const commits = [];
  const db = new Firestore(config, async (method, path, body) => { commits.push({ path, body }); return {}; });
  const records = Array.from({ length: 450 }, (_, i) => ({ path: `items/${i}`, fields: typedFields }));
  assert.equal(await db.apply(records, 'update'), 450);
  assert.deepEqual(commits.map(c => c.body.writes.length), [200, 200, 50]);
  assert.ok(commits.every(c => c.path.endsWith('/documents:commit')));
  assert.deepEqual(commits[0].body.writes[0].update.fields, typedFields);
  assert.equal(commits[0].body.writes[0].updateMask, undefined);
  commits.length = 0;
  await db.apply([{ path: 'items/a', fields: {} }], 'delete');
  assert.equal(commits[0].body.writes[0].delete, `${db.root}/items/a`);
});

test('authenticated REST URLs preserve action suffixes and escape document IDs', async () => {
  const requests = [];
  const db = new Firestore(config);
  db.auth.getClient = async () => ({ request: async options => { requests.push(options); return { data: {} }; } });
  await db.test();
  await db.request('POST', `${db.root}/items/a?#:listCollectionIds`, { pageSize: 100 });
  await db.commit([{ delete: `${db.root}/items/a` }]);
  assert.ok(requests[0].url.endsWith('/documents:listCollectionIds'));
  assert.ok(requests[1].url.endsWith('/items/a%3F%23:listCollectionIds'));
  assert.ok(requests[2].url.endsWith('/documents:commit'));
});

test('truncated backup fails verification and cross-database restore makes no writes', async t => {
  const { engine, db } = await fixture(t);
  const saved = await backup(engine);
  const content = await readFile(engine.file(saved.id), 'utf8');
  await writeFile(engine.file(saved.id), content.split('\n').slice(0, -2).join('\n') + '\n');
  await assert.rejects(() => validateBackup(engine.file(saved.id), saved), /incomplete/);
  await engine.configure({ ...config, projectId: 'another-project' });
  await engine.startJob('restore', saved.id); await engine.task;
  assert.equal(engine.state.lastJob.status, 'failed'); assert.equal(db.writes.length, 0);
});

test('HTTP dashboard authenticates, rejects cross-origin mutations and unconfirmed restores, and downloads backup', async t => {
  const { engine } = await fixture(t);
  const saved = await backup(engine);
  const password = 'long-test-password-123';
  const server = createApp(engine, { user: 'admin', password });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  const status = await fetch(`${base}/api/status`, { headers: { authorization } });
  assert.equal(status.status, 200); assert.ok(!(await status.text()).includes('private_key'));
  const html = await fetch(base, { headers: { authorization } }); assert.match(await html.text(), /A little peace of mind/);
  const headers = { authorization, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/backup`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/restore`, { method: 'POST', headers, body: JSON.stringify({ id: saved.id, confirmation: 'wrong' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/backup`, { method: 'POST', headers: { authorization, 'Content-Type': 'text/plain' }, body: '{}' })).status, 400);
  const download = await fetch(`${base}/api/backups/${saved.id}/download`, { headers: { authorization } });
  assert.equal(download.status, 200); assert.match(await download.text(), /9223372036854775807/);
  const started = await fetch(`${base}/api/backup`, { method: 'POST', headers, body: '{}' });
  assert.equal(started.status, 202); await engine.task;
});

test('browser login uses cookies with visible errors, no password challenges, and revocable sessions', async t => {
  const { engine } = await fixture(t);
  const password = 'session-login-test-password';
  const server = createApp(engine, { user: 'admin', password });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const redirect = await fetch(base, { redirect: 'manual' });
  assert.equal(redirect.status, 303); assert.equal(redirect.headers.get('location'), '/login');
  assert.equal(redirect.headers.get('www-authenticate'), null);
  const page = await fetch(`${base}/login`); assert.match(await page.text(), /id="login-form"/);
  const headers = { 'Content-Type': 'application/json' };
  const login = (data, extra = {}) => fetch(`${base}/api/login`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(data) });
  const bad = await login({ username: 'admin', password: 'wrong' });
  assert.equal(bad.status, 401); assert.equal(bad.headers.get('www-authenticate'), null);
  assert.match((await bad.json()).error, /Incorrect username or password/);
  assert.equal((await login({ username: 'admin', password }, { Origin: 'https://evil.example' })).status, 403);
  const good = await login({ username: 'admin', password });
  assert.equal(good.status, 200);
  const setCookie = good.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/); assert.match(setCookie, /Max-Age=43200/);
  const Cookie = setCookie.split(';')[0];
  const authenticated = await fetch(`${base}/api/status`, { headers: { Cookie } });
  assert.equal(authenticated.status, 200);
  const cachedBadBasic = 'Basic ' + Buffer.from('admin:stale-password').toString('base64');
  assert.equal((await fetch(`${base}/api/status`, { headers: { Cookie, Authorization: cachedBadBasic } })).status, 200);
  const dashboard = await fetch(base, { headers: { Cookie } }); assert.match(await dashboard.text(), /A little peace of mind/);
  const forged = await fetch(`${base}/api/status`, { headers: { Cookie: 'fsbak_session=forged' } });
  assert.equal(forged.status, 401); assert.equal(forged.headers.get('www-authenticate'), null);
  const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { ...headers, Cookie }, body: '{}' });
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${base}/api/status`, { headers: { Cookie } })).status, 401);
});
