import assert from 'node:assert/strict';
import test from 'node:test';
import { planFutureRowFormulaTemplate } from '../src/ledger/formulaGuard.js';
import {
  assertLedgerStateFresh, createLedgerStateSnapshot, StaleWriteConflictError,
} from '../src/ledger/optimisticConcurrency.js';

test('optimistic state check reports STALE_WRITE_CONFLICT for changed relevant state', () => {
  const expected = createLedgerStateSnapshot('A2:AC2', new Map([['A2', { value: 1 }]]), 10);
  const unchanged = createLedgerStateSnapshot('A2:AC2', new Map([['A2', { value: 1 }]]), 11);
  assert.doesNotThrow(() => assertLedgerStateFresh(expected, unchanged));

  const changed = createLedgerStateSnapshot('A2:AC2', new Map([['A2', { value: 2 }]]), 11);
  assert.throws(
    () => assertLedgerStateFresh(expected, changed),
    (error) => error instanceof StaleWriteConflictError && error.code === 'STALE_WRITE_CONFLICT',
  );
});

test('future-row formula guard infers formula only from agreeing neighbours', () => {
  const cells = new Map([
    ['H2', { formula: '=IF(A2="","",A2)' }],
    ['H3', { formula: '=IF(A3="","",A3)' }],
    ['H4', { cell_styles: { number_format: '0' }, data_validation: { type: 'number' } }],
  ]);
  const plan = planFutureRowFormulaTemplate(cells, 4, true, ['H']);
  assert.deepEqual(plan.requiredFormulaAddresses, ['H4']);
  assert.equal(plan.repairs[0]?.newFormula, '=IF(A4="","",A4)');
  assert.equal(plan.repairs[0]?.newValue, undefined);
});

test('future-row formula guard fails when neighbouring patterns disagree', () => {
  const cells = new Map([
    ['H2', { formula: '=A2' }],
    ['H3', { formula: '=B3' }],
  ]);
  assert.throws(() => planFutureRowFormulaTemplate(cells, 4, true, ['H']), /patterns differ/);
  assert.throws(() => planFutureRowFormulaTemplate(cells, 4, false, ['H']), /confirmed future rows/);
});
