import assert from 'node:assert/strict';
import test from 'node:test';
import { assertColumnWriteAllowed } from '../src/config/ledgerSchema.js';
import { prepareLedgerWrite } from '../src/ledger/typedWrite.js';
import { sameProtectedCells, validateChangeType, verifyDateReadback, verifyLedgerWrite, writeCellPayload } from '../src/feishu/write.js';
import type { ProposedChange } from '../src/feishu/types.js';

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

test('date proposal becomes a numeric value with explicit yyyy-mm-dd style', () => {
  const prepared = prepareLedgerWrite({
    action: '期初库存', date: '2026-08-20', qty: 1, toLocation: 'R1', stockCondition: '新机',
  });
  const date = prepared.proposedCells.find((cell) => cell.column === 'A');
  assert(date);
  const change: ProposedChange = {
    sheet: 'test', cell: 'A2', newValue: date.value, valueType: date.valueType,
    reason: 'typed date regression',
  };
  if (date.numberFormat !== undefined) change.numberFormat = date.numberFormat;
  assert.doesNotThrow(() => validateChangeType(change));
  assert.deepEqual(writeCellPayload(change), {
    value: date.value, cell_styles: { number_format: 'yyyy-mm-dd' },
  });
});

test('date write rejects text values or missing date format', () => {
  assert.throws(() => validateChangeType({
    sheet: 'test', cell: 'A2', newValue: '2026-08-20', valueType: 'date',
    numberFormat: 'yyyy-mm-dd', reason: 'bad date',
  }));
  assert.throws(() => validateChangeType({
    sheet: 'test', cell: 'A2', newValue: 46254, valueType: 'date',
    reason: 'missing format',
  }));
});

test('typed date reread requires date dtype and yyyy-mm-dd format', () => {
  const change: ProposedChange = {
    sheet: 'test', cell: 'A2', newValue: 46254, valueType: 'date',
    numberFormat: 'yyyy-mm-dd', reason: 'typed date regression',
  };
  assert.doesNotThrow(() => verifyDateReadback(change, {
    name: 'test', range: 'A2:A2', columns: ['col1'], data: [['2026-08-20']],
    dtypes: { col1: 'datetime64[ns]' }, formats: { col1: 'yyyy-mm-dd' },
  }));
  assert.throws(() => verifyDateReadback(change, {
    name: 'test', range: 'A2:A2', columns: ['col1'], data: [['2026-08-20']],
    dtypes: { col1: 'object' }, formats: { col1: 'yyyy-mm-dd' },
  }));
  assert.throws(() => verifyDateReadback(change, {
    name: 'test', range: 'A2:A2', columns: ['col1'], data: [['2026-08-21']],
    dtypes: { col1: 'datetime64[ns]' }, formats: { col1: 'yyyy-mm-dd' },
  }));
});

test('ledger verification rejects string Qty and accepts numeric Qty', () => {
  const change: ProposedChange = {
    sheet: 'test', cell: 'K2', newValue: 1, valueType: 'number', numberFormat: '0', reason: 'qty',
  };
  assert.equal(verifyLedgerWrite({
    changes: [change], actualCells: new Map([['K2', { value: '1' }]]),
    typedReads: new Map([['K2', {
      name: 'test', range: 'K2:K2', columns: ['col1'], data: [['1']], dtypes: { col1: 'object' },
    }]]),
  }).ok, false);
  assert.equal(verifyLedgerWrite({
    changes: [change], actualCells: new Map([['K2', { value: '1' }]]),
    typedReads: new Map([['K2', {
      name: 'test', range: 'K2:K2', columns: ['col1'], data: [[1]], dtypes: { col1: 'float64' },
    }]]),
  }).ok, true);
});

test('ledger verification requires exact text and required formulas', () => {
  const textChange: ProposedChange = {
    sheet: 'test', cell: 'G2', newValue: '00123', valueType: 'text', reason: 'identifier',
  };
  const result = verifyLedgerWrite({
    changes: [textChange], actualCells: new Map([['G2', { value: '00123' }]]),
    typedReads: new Map([['G2', {
      name: 'test', range: 'G2:G2', columns: ['col1'], data: [['00123']], dtypes: { col1: 'object' },
    }]]),
    protectedBefore: new Map([['H2', { formula: '=A2' }]]),
    protectedAfter: new Map([['H2', { value: '#VALUE!' }]]),
    requiredFormulaAddresses: ['H2'],
  });
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert(codes.has('PROTECTED_COLUMN_CHANGED'));
  assert(codes.has('REQUIRED_FORMULA_MISSING'));
});

test('protected formula verification allows recalculation but rejects formula mutation', () => {
  const before = new Map([['H2', {
    formula: '=A2', value: 1, cell_styles: { number_format: '0' }, data_validation: { type: 'number' },
  }]]);
  assert.equal(sameProtectedCells(before, new Map([['H2', {
    formula: '=A2', value: 2, cell_styles: { number_format: '0' }, data_validation: { type: 'number' },
  }]])), true);
  assert.equal(sameProtectedCells(before, new Map([['H2', { formula: '=B2', value: 2 }]])), false);
  assert.equal(sameProtectedCells(before, new Map([['H2', {
    formula: '=A2', value: 2, cell_styles: { number_format: '0.00' }, data_validation: { type: 'number' },
  }]])), false);
});
