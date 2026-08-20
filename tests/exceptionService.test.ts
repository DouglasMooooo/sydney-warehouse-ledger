import assert from 'node:assert/strict';
import test from 'node:test';
import { DEEP_QUALITY_EXCEPTION_CODES, detectContainerMismatches, deriveLedgerExceptions, LIVE_OPERATIONAL_EXCEPTION_CODES } from '../src/application/exceptionService.js';
import type { OperationalLedgerRow } from '../src/application/todayTasks.js';

test('exception contract truthfully separates live and deep rules', () => {
  assert(LIVE_OPERATIONAL_EXCEPTION_CODES.includes('INVALID_ACTION'));
  assert(!LIVE_OPERATIONAL_EXCEPTION_CODES.includes('FORMULA_MISSING' as never));
  assert.deepEqual(DEEP_QUALITY_EXCEPTION_CODES, ['DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK']);
});

test('ledger exceptions produce business DTOs without helper coordinates', () => {
  const row: OperationalLedgerRow = { ledgerRow: 42, date: '2026-08-20', outboundDate: '', action: '备货', sh: 'SH1', pickupCode: '', sku: '', model: '', erpWarehouse: '', fromLocation: '', toLocation: '', container: '', sn: '', stockCondition: 'bad' };
  const issues = deriveLedgerExceptions([row]);
  assert(issues.some((item) => item.code === 'INVALID_QTY'));
  assert(issues.some((item) => item.code === 'MISSING_SKU'));
  assert(issues.some((item) => item.code === 'PREPARED_WITHOUT_PICKUP_CODE'));
  assert(!JSON.stringify(issues).includes('sheet_id'));
});

test('container mismatch means one container in multiple locations', () => {
  const issues = detectContainerMismatches([
    { container: 'Mix001', location: 'R1' }, { container: 'Mix001', location: 'R2' },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, 'CONTAINER_MISMATCH');
});
