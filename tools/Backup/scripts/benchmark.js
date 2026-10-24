// A reproducible latency benchmark. Uses simulated requests, never real Firestore.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Firestore } from '../src/firestore.js';

const count = 400, latencyMs = 5;
async function measure(concurrency) {
  const db = new Firestore({ projectId: 'benchmark-project', databaseId: '(default)' }, async (method, path, body, query) => {
    await new Promise(resolve => setTimeout(resolve, latencyMs));
    if (path === `${db.root}:listCollectionIds`) return { collectionIds: ['items'] };
    if (path === `${db.root}/items`) {
      const offset = Number(query.pageToken || 0);
      return { documents: Array.from({ length: Math.min(100, count - offset) }, (_, i) => ({
        name: `${db.root}/items/${offset + i}`, createTime: '2026-01-01T00:00:00Z', fields: { value: { integerValue: String(offset + i) } },
      })), ...(offset + 100 < count ? { nextPageToken: String(offset + 100) } : {}) };
    }
    return {};
  }, { concurrency });
  const hash = createHash('sha256');
  let documents = 0;
  const started = performance.now();
  for await (const document of db.documents()) { documents++; hash.update(JSON.stringify(document)); }
  return { concurrency, documents, ms: Math.round(performance.now() - started), sha256: hash.digest('hex') };
}
const sequential = await measure(1), parallel = await measure(8);
assert.equal(sequential.documents, count); assert.equal(parallel.documents, count);
assert.equal(sequential.sha256, parallel.sha256);
console.log(JSON.stringify({ simulatedNetworkLatencyMs: latencyMs, sequential, parallel,
  speedup: `${(sequential.ms / parallel.ms).toFixed(1)}x`, identicalDocumentsAndOrder: true }, null, 2));
