import assert from 'node:assert/strict';
import test from 'node:test';
import { assertColumnWriteAllowed } from '../src/config/ledgerSchema.js';
import { prepareLedgerWrite } from '../src/ledger/typedWrite.js';

test('protected column direct business write is rejected', () => assert.throws(() => assertColumnWriteAllowed('H', 'BUSINESS_RECORD')));
test('formula repair may target protected column', () => assert.doesNotThrow(() => assertColumnWriteAllowed('H', 'FORMULA_REPAIR')));
test('prepared write emits only business columns with typed date and text SKU', () => {
  const result = prepareLedgerWrite({
    date: '2026-08-20', action: '备货', shNo: ' SH1 ', pickupCode: 'SYD-00315',
    sku: '00123', qty: '1', fromLocation: 'R1-1-1-L', erpWarehouse: 'Sydney', stockCondition: '新机',
  });
  assert.equal(result.ok, true);
  assert.equal(result.proposedCells.find((cell) => cell.column === 'A')?.valueType, 'date');
  assert.equal(result.proposedCells.find((cell) => cell.column === 'G')?.value, '00123');
  assert(!result.proposedCells.some((cell) => ['H', 'I', 'O', 'AB', 'AC'].includes(cell.column)));
});
