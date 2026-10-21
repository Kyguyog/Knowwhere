import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export async function atomicJson(path, value) {
  const temp = `${path}.tmp`;
  const file = await open(temp, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); }
  finally { await file.close(); }
  await rename(temp, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export class Storage {
  constructor(dir) { this.dir = dir; this.backups = join(dir, 'backups'); }
  async init() {
    await mkdir(this.backups, { recursive: true, mode: 0o700 });
    const path = join(this.dir, 'key');
    try { this.key = await readFile(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.key = randomBytes(32);
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(this.key); await file.sync(); } finally { await file.close(); }
    }
    if (this.key.length !== 32) throw new Error('Invalid configuration encryption key. Restore the original data volume.');
  }
  async loadConfig() {
    const data = await readJson(join(this.dir, 'config.json'), null);
    if (!data) return null;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data, 'base64')), decipher.final()]).toString());
  }
  async saveConfig(config) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
    await atomicJson(join(this.dir, 'config.json'), { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  async state() { return readJson(join(this.dir, 'state.json'), {}); }
  async saveState(state) { await atomicJson(join(this.dir, 'state.json'), state); }
}
