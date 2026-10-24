import { createReadStream } from 'node:fs';
import { open, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { Firestore, validateConnection } from './firestore.js';
import { atomicJson, readJson } from './storage.js';
import { isExcluded, normalizeExclusions, validatePath } from './exclusions.js';

export const idPattern = /^[0-9a-f-]{36}$/;
const sameDatabase = (a, b) => a.projectId === b.projectId && a.databaseId === b.databaseId;

export function validateSettings(input) {
  const { intervalValue, intervalUnit, retention, enabled } = input;
  const factors = { minutes: 60000, hours: 3600000, days: 86400000 };
  if (!Number.isInteger(intervalValue) || intervalValue < 1 || intervalValue > 365000 || !Object.hasOwn(factors, intervalUnit)) {
    throw new Error('Choose a positive whole-number interval in minutes, hours, or days.');
  }
  if (!Number.isInteger(retention) || retention < 1 || retention > 1000) throw new Error('Keep between 1 and 1,000 backups.');
  if (typeof enabled !== 'boolean') throw new Error('Schedule enabled must be true or false.');
  return { intervalValue, intervalUnit, intervalMs: intervalValue * factors[intervalUnit], retention, enabled };
}

export async function* readBackup(path) {
  const input = createReadStream(path);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line) throw new Error('Backup contains an empty record.');
      yield { record: JSON.parse(line), line };
    }
  } finally { lines.close(); input.destroy(); }
}

export async function validateBackup(path, expected) {
  let header, footer, count = 0;
  const hash = createHash('sha256');
  for await (const { record, line } of readBackup(path)) {
    if (!header) {
      if (record.type !== 'header' || record.version !== 1 || !sameDatabase(record, expected) || record.id !== expected.id) {
        throw new Error('Backup header does not match the selected database or backup.');
      }
      header = record;
      const exclusions = normalizeExclusions(record.excludedPaths, Infinity);
      if (JSON.stringify(exclusions) !== JSON.stringify(normalizeExclusions(expected.excludedPaths, Infinity))) {
        throw new Error('Backup exclusions do not match its metadata. Restore was stopped.');
      }
    } else if (footer) throw new Error('Unexpected data after backup checksum.');
    else if (record.type === 'footer') footer = record;
    else {
      if (record.type !== 'document' || typeof record.path !== 'string' || record.path.split('/').length % 2 ||
          record.path.split('/').some(part => !part || part === '.' || part === '..') ||
          !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
        throw new Error('Invalid document in backup.');
      }
      hash.update(`${line}\n`); count++;
    }
  }
  if (!header || !footer || footer.count !== count || footer.sha256 !== hash.digest('hex') || count !== expected.count) {
    throw new Error('Backup is incomplete or its checksum is invalid. Restore was stopped.');
  }
  return header;
}

async function* documentsFrom(path, exclusions = []) {
  for await (const { record } of readBackup(path)) if (record.type === 'document' && !isExcluded(record.path, exclusions)) yield record;
}

export class Engine {
  constructor(storage, factory = config => new Firestore(config)) {
    this.storage = storage; this.factory = factory; this.active = null; this.task = null;
  }
  async init() {
    await this.storage.init();
    this.config = await this.storage.loadConfig();
    this.state = await this.storage.state();
    if (this.state.active) {
      this.state.lastJob = { ...this.state.active, status: 'failed', error: 'Container stopped during this job. Partial backups were not published. If restoring, inspect the database and restore again from the protected recovery backup.', finishedAt: new Date().toISOString() };
      delete this.state.active;
      await this.persist();
    }
  }
  file(id, suffix = 'ndjson') {
    if (!idPattern.test(id)) throw new Error('Invalid backup ID.');
    return join(this.storage.backups, `${id}.${suffix}`);
  }
  async list() {
    const files = await readdir(this.storage.backups);
    const result = [];
    for (const file of files) if (/^[0-9a-f-]{36}\.json$/.test(file)) {
      const backup = await readJson(join(this.storage.backups, file));
      if (backup) result.push({ ...backup, protected: this.state.recovery?.ids.includes(backup.id) || false });
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  publicConfig() {
    const c = this.config;
    return c ? { projectId: c.projectId, databaseId: c.databaseId, clientEmail: c.serviceAccount.client_email,
      intervalValue: c.intervalValue, intervalUnit: c.intervalUnit, retention: c.retention, enabled: c.enabled,
      excludedPaths: c.excludedPaths || [] } : null;
  }
  async status() {
    return { config: this.publicConfig(), nextAt: this.state.nextAt || null, active: this.active,
      lastJob: this.state.lastJob || null, recovery: this.state.recovery || null, backups: await this.list() };
  }
  assertIdle() { if (this.active) throw new Error('Another job is running. Wait for it to finish.'); }
  async persist() { await this.storage.saveState(this.state); }
  async configure(input) {
    this.assertIdle();
    if (this.state.recovery) throw new Error('Resolve the interrupted restore before changing settings.');
    this.active = { type: 'settings', phase: 'Testing connection', startedAt: new Date().toISOString() };
    try {
      const config = { ...validateConnection(input, this.config), ...validateSettings(input) };
      config.excludedPaths = normalizeExclusions(input.excludedPaths ?? (sameDatabase(config, this.config || {}) ? this.config?.excludedPaths : []));
      await this.factory(config).test();
      const changed = !this.config || !sameDatabase(config, this.config) || config.intervalMs !== this.config.intervalMs || config.enabled !== this.config.enabled;
      await this.storage.saveConfig(config);
      this.config = config;
      if (changed || !this.state.nextAt) this.state.nextAt = new Date(Date.now() + config.intervalMs).toISOString();
      await this.persist();
      await this.prune();
    } finally { this.active = null; }
  }
  async tree(path = '', pageToken) {
    if (!this.config) throw new Error('Save your Firestore connection first.');
    validatePath(path, true);
    const config = this.config;
    return { projectId: config.projectId, databaseId: config.databaseId, path, ...await this.factory(config).tree(path, pageToken) };
  }
  async setExclusions(input) {
    this.assertIdle();
    if (!this.config) throw new Error('Save your Firestore connection first.');
    if (this.state.recovery) throw new Error('Resolve the interrupted restore before changing exclusions.');
    if (!sameDatabase(input, this.config)) throw new Error('The connected database changed. Reload the tree before saving exclusions.');
    const excludedPaths = normalizeExclusions(input.excludedPaths);
    this.active = { type: 'settings', phase: 'Saving exclusions' };
    try {
      const config = { ...this.config, excludedPaths };
      await this.storage.saveConfig(config);
      this.config = config;
    } finally { this.active = null; }
  }
  async prune() {
    const backups = await this.list();
    const protectedIds = new Set(this.state.recovery?.ids || []);
    // Protected restore files can temporarily exceed retention, including with keep=1.
    const keep = new Set([...backups.slice(0, this.config?.retention ?? 100).map(b => b.id), ...protectedIds]);
    for (const backup of backups) if (!keep.has(backup.id)) {
      await rm(this.file(backup.id, 'json'), { force: true });
      await rm(this.file(backup.id), { force: true });
    }
  }
  progress(phase, count = 0) {
    if (this.active) Object.assign(this.active, { phase, count });
  }
  async capture(kind, db, excludedPaths = this.config.excludedPaths || []) {
    const id = randomUUID(), path = this.file(id), partial = `${path}.partial`;
    const metadata = { id, projectId: this.config.projectId, databaseId: this.config.databaseId,
      kind, createdAt: new Date().toISOString(), count: 0, excludedPaths: normalizeExclusions(excludedPaths, Infinity) };
    const file = await open(partial, 'wx', 0o600);
    const hash = createHash('sha256');
    let buffer = [], bufferBytes = 0;
    const flush = async () => {
      if (!buffer.length) return;
      await file.writeFile(buffer.join(''));
      buffer = []; bufferBytes = 0;
    };
    try {
      await file.writeFile(`${JSON.stringify({ type: 'header', version: 1, ...metadata })}\n`);
      for await (const document of db.documents(undefined, undefined, metadata.excludedPaths)) {
        if (isExcluded(document.path, metadata.excludedPaths)) continue;
        const line = `${JSON.stringify({ type: 'document', ...document })}\n`;
        hash.update(line); buffer.push(line); bufferBytes += Buffer.byteLength(line); metadata.count++;
        if (bufferBytes >= 256 * 1024) await flush();
        this.progress(kind === 'safety' ? 'Creating safety backup' : 'Reading documents', metadata.count);
      }
      await flush();
      metadata.sha256 = hash.digest('hex');
      await file.writeFile(`${JSON.stringify({ type: 'footer', count: metadata.count, sha256: metadata.sha256 })}\n`);
      await file.sync();
    } catch (error) { await file.close(); await rm(partial, { force: true }); throw error; }
    await file.close();
    await rename(partial, path);
    metadata.bytes = (await stat(path)).size;
    await atomicJson(this.file(id, 'json'), metadata);
    return metadata;
  }
  async restore(id, db, { includeExcluded = false } = {}) {
    const backup = (await this.list()).find(b => b.id === id);
    if (!backup || !sameDatabase(backup, this.config)) throw new Error('Choose a backup from the configured project and database.');
    this.progress('Checking backup');
    const header = await validateBackup(this.file(id), backup);
    // An override may include currently excluded data that exists in this backup.
    // Recorded omissions remain protected: there is no source data to restore.
    const exclusions = normalizeExclusions([...(includeExcluded ? [] : this.config.excludedPaths || []), ...(header.excludedPaths || [])], Infinity);
    // Persist protection before creating the safety file, and before any database writes.
    this.state.recovery = { ids: [...new Set([...(this.state.recovery?.ids || []), id])], targetId: id };
    await this.persist();
    this.progress('Creating safety backup');
    const safety = await this.capture('safety', db, exclusions);
    this.state.recovery.ids.push(safety.id);
    this.state.recovery.safetyId = safety.id;
    await this.persist();
    await validateBackup(this.file(safety.id), safety);
    this.active.safetyId = safety.id;
    this.state.active = { ...this.active };
    await this.persist();
    // Delete from the completed safety manifest, never from a live paginated query.
    this.progress('Removing current documents');
    await db.apply(documentsFrom(this.file(safety.id), exclusions), 'delete', count => this.progress('Removing current documents', count));
    this.progress('Restoring documents');
    const count = await db.apply(documentsFrom(this.file(id), exclusions), 'update', count => this.progress('Restoring documents', count));
    delete this.state.recovery;
    return { restoredId: id, safetyId: safety.id, count, excludedPaths: exclusions };
  }
  async startJob(type, id, { includeExcluded = false } = {}) {
    this.assertIdle();
    if (typeof includeExcluded !== 'boolean') throw new Error('includeExcluded must be true or false.');
    if (includeExcluded && type !== 'manual' && type !== 'restore') throw new Error('Only manual backups and restores can include excluded data for one run.');
    if (!this.config) throw new Error('Save your Firestore connection first.');
    if (this.state.recovery && type !== 'restore') throw new Error('A restore needs attention. Restore a protected backup or acknowledge recovery first.');
    const job = { id: randomUUID(), type, includeExcluded, status: 'running', phase: 'Starting', count: 0, startedAt: new Date().toISOString() };
    this.active = job;
    this.state.active = { ...job };
    try { await this.persist(); } catch (error) { this.active = null; delete this.state.active; throw error; }
    this.task = this.runJob(job, id);
    return job;
  }
  async runJob(job, id) {
    try {
      const db = this.factory(this.config);
      job.result = job.type === 'restore' ? await this.restore(id, db, { includeExcluded: job.includeExcluded }) :
        await this.capture(job.type, db, job.type === 'manual' && job.includeExcluded ? [] : this.config.excludedPaths || []);
      await this.prune();
      job.status = 'completed'; job.phase = 'Complete';
    } catch (error) {
      job.status = 'failed'; job.error = error.message; job.phase = 'Failed';
    } finally {
      job.finishedAt = new Date().toISOString();
      this.state.lastJob = { ...job };
      delete this.state.active;
      this.state.nextAt = new Date(Date.now() + this.config.intervalMs).toISOString();
      // Keep the lock until job state is durable.
      try { await this.persist(); } catch { console.error('Unable to persist completed job state. Check data volume space and permissions.'); }
      this.active = null;
    }
  }
  async tick(now = Date.now()) {
    if (!this.active && this.config?.enabled && !this.state.recovery && now >= Date.parse(this.state.nextAt || 0)) {
      await this.startJob('scheduled');
    }
  }
  async acknowledgeRecovery() {
    this.assertIdle();
    this.active = { type: 'recovery', phase: 'Acknowledging recovery' };
    try {
      delete this.state.recovery;
      await this.persist();
      await this.prune();
    } finally { this.active = null; }
  }
}
