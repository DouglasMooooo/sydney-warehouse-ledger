import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareBadMachineReceivePreview, type SnResolverReadPort } from '../src/application/badMachineReceive.js';

const port: SnResolverReadPort = {
  async readSnResolverContext() {
    return {
      verifiedMappings: [],
      materialOptions: [{ materialCode: '97-141-00060-B0', model: 'H3-10.0-Smart' }],
      operationalStates: [
        { sn: '60KB103061NB141', currentState: 'OUTBOUND', previouslyOutbound: true, latestAction: '出库', reason: 'fixture' },
        { sn: '60CQ00L0623Y117', currentState: 'REPAIR', previouslyOutbound: false, latestAction: '退回维修', reason: 'fixture' },
      ],
    };
  },
};

test('batch keeps duplicates visible and marks review/inventory rows non-default', async () => {
  const preview = await prepareBadMachineReceivePreview([
    '60KB103061NB141', '60KB103061NB141', '60CQ00L0623Y117', '60E5M48R65XX999',
  ], '2026-08-25', port);
  assert.equal(preview.rows.length, 4);
  assert.equal(preview.rows[0]?.defaultSelected, true);
  assert(preview.rows[0]?.issues.includes('PREVIOUSLY_OUTBOUND'));
  assert(preview.rows[1]?.issues.includes('DUPLICATE_IN_BATCH'));
  assert.equal(preview.rows[1]?.defaultSelected, false);
  assert(preview.rows[2]?.issues.includes('ALREADY_IN_INVENTORY:REPAIR'));
  assert.equal(preview.rows[2]?.defaultSelected, false);
  assert.equal(preview.rows[3]?.resolution.confidence, 'REVIEW_REQUIRED');
  assert.equal(preview.rows[3]?.defaultSelected, false);
  assert.deepEqual(preview.summary, { total: 4, ready: 1, reviewRequired: 1, duplicates: 1, inventoryWarnings: 1 });
  assert.equal(preview.zeroWritesPerformed, true);
});

test('input limits and empty batches fail before any write', async () => {
  await assert.rejects(() => prepareBadMachineReceivePreview('', '2026-08-25', port), /至少输入一个 SN/);
  await assert.rejects(() => prepareBadMachineReceivePreview(Array.from({ length: 501 }, (_, index) => `SN-${index}`), '2026-08-25', port), /最多处理 500/);
});

