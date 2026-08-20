import assert from 'node:assert/strict';
import test from 'node:test';
import { detectContainerMismatches, deriveLedgerExceptions, OPERATIONAL_EXCEPTION_CODES } from '../src/application/exceptionService.js';
import type { OperationalLedgerRow } from '../src/application/todayTasks.js';

test('exception contract includes every Phase 2 rule code', () => {
  for (const code of ['DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'INVALID_ACTION', 'INVALID_STOCK_CONDITION', 'INVALID_LOCATION', 'INVALID_QTY', 'MISSING_SKU', 'MISSING_SN', 'PREPARED_WITHOUT_SOURCE_LOCATION', 'PREPARED_WITHOUT_PICKUP_CODE', 'PRODUCT_OUTBOUND_WITHOUT_SN', 'RETURN_WITHOUT_TARGET_LOCATION', 'MOVE_WITHOUT_SOURCE', 'MOVE_WITHOUT_TARGET', 'CONTAINER_MISMATCH', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK', 'MISSING_INVENTORY_QTY', 'INVALID_INVENTORY_QTY']) {
    assert(OPERATIONAL_EXCEPTION_CODES.includes(code as never), code);
  }
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
