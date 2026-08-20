import assert from 'node:assert/strict';
import test from 'node:test';
import { planFutureRowFormulaTemplate } from '../src/ledger/formulaGuard.js';
import {
  assertLedgerStateFresh, assertOperationPreconditionFresh, createLedgerStateSnapshot,
  createOperationPrecondition, StaleWriteConflictError,
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

test('unrelated target precondition cannot authorize a ledger-row write', () => {
  const unrelated = createLedgerStateSnapshot('A1:A1', new Map([['A1', { value: 'unchanged' }]]));
  assert.throws(
    () => createOperationPrecondition('MOVE', 2000, unrelated, [{
      kind: 'CURRENT_SERIAL_STATE',
      snapshot: createLedgerStateSnapshot('A10:P10', new Map()),
    }]),
    /must cover A2000:AC2000/,
  );
});

test('stale inventory dependency produces STALE_WRITE_CONFLICT', () => {
  const target = createLedgerStateSnapshot('A2000:AC2000', new Map([['A2000', {}]]));
  const expectedInventory = createLedgerStateSnapshot('A100:M100', new Map([['M100', { value: 4 }]]));
  const actualInventory = createLedgerStateSnapshot('A100:M100', new Map([['M100', { value: 3 }]]));
  const expected = createOperationPrecondition('WORK_ORDER_PREPARED', 2000, target, [
    { kind: 'INVENTORY_SELECTION', snapshot: expectedInventory },
    { kind: 'PICKUP_CODE_UNIQUENESS', snapshot: createLedgerStateSnapshot('E2:E1999', new Map()) },
  ]);
  const actual = createOperationPrecondition('WORK_ORDER_PREPARED', 2000, target, [
    { kind: 'INVENTORY_SELECTION', snapshot: actualInventory },
    { kind: 'PICKUP_CODE_UNIQUENESS', snapshot: createLedgerStateSnapshot('E2:E1999', new Map()) },
  ]);
  assert.throws(
    () => assertOperationPreconditionFresh(expected, actual),
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
