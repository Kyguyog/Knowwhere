import { GoogleAuth } from 'google-auth-library';
import { createPrivateKey } from 'node:crypto';
import { isExcluded, normalizeExclusions, validatePath } from './exclusions.js';

export function validateConnection(input, previous) {
  let key = input.serviceAccount || previous?.serviceAccount;
  if (typeof key === 'string') {
    try { key = JSON.parse(key); } catch { throw new Error('Service account must be valid JSON.'); }
  }
  if (!key || key.type !== 'service_account' || typeof key.private_key !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(key.client_email || '')) {
    throw new Error('Paste a Firebase service-account JSON key, not the browser Firebase config.');
  }
  try {
    if (createPrivateKey(key.private_key).asymmetricKeyType !== 'rsa') throw new Error();
  } catch { throw new Error('The service account private key is invalid.'); }
  const projectId = input.projectId?.trim() || key.project_id;
  const databaseId = input.databaseId?.trim() || '(default)';
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId || '')) throw new Error('Invalid Google Cloud project ID.');
  if (databaseId !== '(default)' && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId)) throw new Error('Invalid database ID.');
  return { projectId, databaseId, serviceAccount: {
    type: 'service_account', project_id: key.project_id,
    client_email: key.client_email, private_key: key.private_key,
  } };
}

// Keep Firestore's REST Value objects intact: no conversion through JS numbers or Dates.
export class Firestore {
  constructor(config, request, { concurrency = 8 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('BACKUP_CONCURRENCY must be a whole number between 1 and 32.');
    this.concurrency = concurrency;
    this.excludedPaths = normalizeExclusions(config.excludedPaths);
    this.root = `projects/${config.projectId}/databases/${config.databaseId}/documents`;
    this.auth = new GoogleAuth({ credentials: config.serviceAccount, scopes: ['https://www.googleapis.com/auth/datastore'] });
    this.requestOverride = request;
  }

  async request(method, path, body, query) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const encoded = method === 'POST' ? encodedPath.replace(/%3A(listCollectionIds|commit)$/, ':$1') : encodedPath;
    const url = new URL(`https://firestore.googleapis.com/v1/${encoded}`);
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, value);
    if (this.requestOverride) return this.requestOverride(method, path, body, query);
    try {
      const client = await this.auth.getClient();
      const response = await client.request({
        url: url.href, method, data: body, timeout: 60000,
        retry: true, retryConfig: { retry: 5, httpMethodsToRetry: ['GET', 'POST'],
          statusCodesToRetry: [[429, 429], [500, 599]] },
      });
      return response.data;
    } catch (error) {
      // Google errors can contain the request and credential objects; never forward them.
      const status = error.response?.status;
      const reason = error.response?.data?.error?.status;
      throw new Error(`Firestore request failed${status ? ` (${status}${reason ? ` ${reason}` : ''})` : ''}. Check credentials, IAM permissions, database ID, and network access.`);
    }
  }

  async *collections(parent = this.root) {
    let pageToken;
    do {
      const data = await this.request('POST', `${parent}:listCollectionIds`, { pageSize: 100, ...(pageToken ? { pageToken } : {}) });
      yield* (data.collectionIds || []);
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  async test() {
    await this.request('POST', `${this.root}:listCollectionIds`, { pageSize: 1 });
  }

  async tree(path = '', pageToken) {
    validatePath(path, true);
    if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 16000)) throw new Error('Invalid tree page token.');
    const segments = path ? path.split('/') : [];
    const parent = path ? `${this.root}/${path}` : this.root;
    if (segments.length % 2 === 0) {
      const data = await this.request('POST', `${parent}:listCollectionIds`, { pageSize: 100, ...(pageToken ? { pageToken } : {}) });
      return { nodes: (data.collectionIds || []).map(id => ({ id, path: path ? `${path}/${id}` : id, type: 'collection' })), nextPageToken: data.nextPageToken || null };
    }
    const data = await this.request('GET', parent, undefined, { pageSize: 100, showMissing: true, pageToken,
      fields: 'documents(name,createTime),nextPageToken' });
    return { nodes: (data.documents || []).map(document => ({
      id: document.name.split('/').at(-1), path: document.name.slice(this.root.length + 1),
      type: 'document', missing: !document.createTime,
    })), nextPageToken: data.nextPageToken || null };
  }

  async *documents(parent = this.root, collectionIds = this.collections(parent), excludedPaths = this.excludedPaths) {
    for await (const collection of collectionIds) {
      const collectionPath = `${parent}/${collection}`.slice(this.root.length + 1);
      if (isExcluded(collectionPath, excludedPaths)) continue;
      let pageToken;
      do {
        const data = await this.request('GET', `${parent}/${collection}`, undefined,
          { pageSize: 100, showMissing: true, pageToken });
        const documents = (data.documents || []).filter(document => !isExcluded(document.name.slice(this.root.length + 1), excludedPaths));
        for (let offset = 0; offset < documents.length; offset += this.concurrency) {
          // Overlap the per-document network round trips. Prefetch only the first
          // collection page so a wide/deep tree cannot queue the whole database.
          const results = await Promise.allSettled(documents.slice(offset, offset + this.concurrency).map(async document => {
            const children = this.collections(document.name);
            return { document, children, first: await children.next() };
          }));
          try {
            const failed = results.find(result => result.status === 'rejected');
            if (failed) throw failed.reason;
            for (const { value: { document, children, first } } of results) {
              // Missing parents have no createTime; still visit their subcollections.
              if (document.createTime) yield { path: document.name.slice(this.root.length + 1), fields: document.fields || {} };
              if (!first.done) {
                const prefetched = (async function* () { yield first.value; yield* children; })();
                yield* this.documents(document.name, prefetched, excludedPaths);
              }
            }
          } finally {
            // Drain requests before surfacing failures, and close prefetched
            // iterators when the consumer stops (for example after a disk error).
            for (const result of results) if (result.status === 'fulfilled') await result.value.children.return();
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }
  }

  async commit(writes) {
    if (writes.length) await this.request('POST', `${this.root}:commit`, { writes });
  }

  async apply(records, operation, progress = () => {}) {
    let writes = [], bytes = 0, count = 0;
    const flush = async () => {
      if (!writes.length) return;
      await this.commit(writes);
      count += writes.length;
      progress(count);
      writes = []; bytes = 0;
    };
    for await (const record of records) {
      const name = `${this.root}/${record.path}`;
      const write = operation === 'delete' ? { delete: name } : { update: { name, fields: record.fields } };
      const size = Buffer.byteLength(JSON.stringify(write));
      if (writes.length >= 200 || bytes + size > 7 * 1024 * 1024) await flush();
      writes.push(write); bytes += size;
    }
    await flush();
    return count;
  }
}
