import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncMutex } from '../src/feishu/ledgerWriteMutex.js';

test('process mutex serializes queued writes and releases after a failure', async () => {
  const mutex = new AsyncMutex();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = mutex.runExclusive(async () => { events.push('A:start'); await firstGate; events.push('A:end'); });
  const second = mutex.runExclusive(async () => { events.push('B:start'); events.push('B:end'); });
  await new Promise<void>((resolve) => setImmediate(resolve)); assert.deepEqual(events, ['A:start']);
  releaseFirst(); await Promise.all([first, second]);
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end']);
  await assert.rejects(() => mutex.runExclusive(async () => { throw new Error('writer failed'); }), /writer failed/);
  let recovered = false;
  await mutex.runExclusive(async () => { recovered = true; });
  assert.equal(recovered, true);
});
