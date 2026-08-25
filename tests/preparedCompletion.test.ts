import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePreparedCompletion } from '../src/application/preparedCompletion.js';

test('Prepared completion requires auto pickup code, manual SNs, and explicit location confirmation', () => {
  const incomplete = evaluatePreparedCompletion({ expectedQty: 2, snText: 'SN-1', confirmedLocation: '', locationConfirmed: false });
  assert.equal(incomplete.ready, false);
  assert(incomplete.blockers.includes('取件码尚未自动生成'));
  assert(incomplete.blockers.includes('需要人工填写 2 个 SN'));
  assert(incomplete.blockers.includes('必须人工填写最终库位'));
  assert(incomplete.blockers.includes('必须勾选现场库位确认'));
  const ready = evaluatePreparedCompletion({ expectedQty: 2, snText: 'SN-1\nSN-2', confirmedLocation: 'R1-2-3-L', locationConfirmed: true, pickupCode: 'SYD-00011' });
  assert.deepEqual(ready, { ready: true, sns: ['SN-1', 'SN-2'], location: 'R1-2-3-L', blockers: [] });
});

test('Prepared completion rejects duplicate SNs', () => {
  const result = evaluatePreparedCompletion({ expectedQty: 2, snText: 'SN-1\nSN-1', confirmedLocation: 'R1-2-3-L', locationConfirmed: true, pickupCode: 'SYD-00011' });
  assert.equal(result.ready, false);
  assert(result.blockers.includes('SN 不能重复'));
});
