import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Storage } from './storage.js';
import { Engine, idPattern } from './engine.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const digest = value => createHash('sha256').update(value).digest();

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Expected application/json.');
  let bytes = 0, chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 100000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export function createApp(engine, { user, password }) {
  const expected = digest(`${user}:${password}`), attempts = new Map(), sessions = new Map();
  const sessionDuration = 12 * 60 * 60 * 1000;
  const credentialsMatch = value => timingSafeEqual(expected, digest(value));
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok' });
      const address = req.socket.remoteAddress;
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
      for (const [key, expires] of sessions) if (expires < now) sessions.delete(key);
      const previous = attempts.get(address);
      const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('fsbak_session='))?.slice('fsbak_session='.length);
      const sessionKey = cookie ? digest(cookie).toString('hex') : null;
      const sessionValid = sessionKey && sessions.has(sessionKey);
      const raw = req.headers.authorization || '';
      const valid = sessionValid || ((!previous || previous.count < 15) && raw.startsWith('Basic ') && credentialsMatch(Buffer.from(raw.slice(6), 'base64').toString()));
      const deny = () => {
        if (previous?.count >= 15) return json(res, 429, { error: 'Too many login attempts. Try again in a minute.' });
        if (raw) attempts.set(address, { count: (previous?.count || 0) + 1, until: previous?.until || now + 60000 });
        return json(res, 401, { error: 'Sign in to continue.' });
      };
      const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
      const setCookie = (token, maxAge) => res.setHeader('Set-Cookie', `fsbak_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== req.headers.host)) {
          return json(res, 403, { error: 'Cross-site requests are not allowed.' });
        }
        const input = await body(req);
        if (url.pathname === '/api/login') {
          if (previous?.count >= 15) return json(res, 429, { error: 'Too many login attempts. Try again in a minute.' });
          if (input.username !== user || typeof input.password !== 'string' || !credentialsMatch(`${input.username}:${input.password}`)) {
            attempts.set(address, { count: (previous?.count || 0) + 1, until: previous?.until || now + 60000 });
            return json(res, 401, { error: 'Incorrect username or password. Use the ADMIN_USER and ADMIN_PASSWORD values from Backup/.env.' });
          }
          attempts.delete(address);
          const token = randomBytes(32).toString('base64url');
          sessions.set(digest(token).toString('hex'), now + sessionDuration);
          setCookie(token, sessionDuration / 1000);
          return json(res, 200, { ok: true });
        }
        if (!valid) return deny();
        if (url.pathname === '/api/logout') {
          if (sessionKey) sessions.delete(sessionKey);
          setCookie('', 0);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === '/api/config') { await engine.configure(input); return json(res, 200, await engine.status()); }
        if (url.pathname === '/api/backup') return json(res, 202, await engine.startJob('manual'));
        if (url.pathname === '/api/restore') {
          if (input.confirmation !== `${engine.config?.projectId}/${engine.config?.databaseId}`) throw new Error('Database confirmation does not match.');
          if (!idPattern.test(input.id || '')) throw new Error('Invalid backup ID.');
          return json(res, 202, await engine.startJob('restore', input.id));
        }
        if (url.pathname === '/api/recovery/acknowledge') {
          if (input.confirmation !== 'RESUME') throw new Error('Type RESUME to acknowledge recovery.');
          await engine.acknowledgeRecovery(); return json(res, 200, await engine.status());
        }
      }
      if (req.method === 'GET') {
        const publicFiles = { '/login': ['login.html', 'text/html'], '/login.js': ['login.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        const publicAsset = Object.hasOwn(publicFiles, url.pathname) ? publicFiles[url.pathname] : null;
        if (publicAsset) {
          const content = await readFile(join(publicDir, publicAsset[0]));
          res.writeHead(200, { 'Content-Type': `${publicAsset[1]}; charset=utf-8` }); res.end(content); return;
        }
        if (!valid) {
          if (!url.pathname.startsWith('/api/')) { res.writeHead(303, { Location: '/login' }); res.end(); return; }
          return deny();
        }
        if (url.pathname === '/api/status') return json(res, 200, await engine.status());
        const download = url.pathname.match(/^\/api\/backups\/([0-9a-f-]{36})\/download$/);
        if (download) {
          if (!(await engine.list()).some(b => b.id === download[1])) return json(res, 404, { error: 'Backup not found.' });
          res.setHeader('Content-Type', 'application/x-ndjson');
          res.setHeader('Content-Disposition', `attachment; filename="fsbak-${download[1]}.ndjson"`);
          await pipeline(createReadStream(engine.file(download[1])), res);
          return;
        }
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        const asset = Object.hasOwn(files, url.pathname) ? files[url.pathname] : null;
        if (asset) {
          const content = await readFile(join(publicDir, asset[0]));
          res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(content); return;
        }
      }
      json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error.message });
      else res.destroy();
    }
  });
}

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 16) throw new Error('Set ADMIN_PASSWORD to a unique password with at least 16 characters.');
  const user = process.env.ADMIN_USER || 'admin';
  if (user.includes(':')) throw new Error('ADMIN_USER cannot contain a colon.');
  const engine = new Engine(new Storage(resolve(process.env.DATA_DIR || './data')));
  await engine.init();
  const server = createApp(engine, { user, password });
  const timer = setInterval(() => engine.tick().catch(() => console.error('Scheduled backup could not start. Check the dashboard and data volume.')), 10000);
  timer.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.PORT || 8080), '0.0.0.0', resolve);
  });
  console.log(`fsbak listening on port ${server.address().port}`);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return; stopping = true;
    clearInterval(timer);
    const closed = new Promise(resolve => server.close(resolve));
    await closed;
    await engine.task;
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
