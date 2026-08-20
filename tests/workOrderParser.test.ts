import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlainTextWorkOrder } from '../src/workOrders/textParser.js';
import { parseXlsxWorkbookData } from '../src/workOrders/xlsxParser.js';

const valid = 'SH: SH-1\nFaulty Unit information\nSKU: BAD-1\nQty: 1\nERP Warehouse: BAD\nReplacement Unit information\nReplacement Unit: GOOD-1\nQty: 2\nERP Warehouse: 悉尼物料仓';

test('plain text parser reads only a clear Replacement section', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: valid, sourceFileName: 'fixture.txt' });
  assert.equal(parsed.confidence, 'high');
  assert.equal(parsed.shNo, 'SH-1');
  assert.deepEqual(parsed.replacementLines, [{ sku: 'GOOD-1', qty: 2, erpWarehouse: '悉尼物料仓', sourceRow: 7 }]);
  assert.equal(parsed.sourceFileName, 'fixture.txt');
});

test('Faulty and Replacement sections never cross-contaminate', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: valid });
  assert(!parsed.replacementLines.some((line) => line.sku === 'BAD-1'));
});

test('Faulty-only input needs confirmation and yields no replacement', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: 'SH: SH-1\nFaulty Unit information\nSKU: BAD-1\nQty: 1' });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(parsed.replacementLines, []);
  assert(parsed.warnings.includes('REPLACEMENT_SECTION_NOT_FOUND'));
});

test('plain text parser supports multiple complete replacement lines', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: `${valid}\nReplacement Unit: GOOD-2\nQty: 1\nERP Warehouse: 悉尼良品仓` });
  assert.equal(parsed.confidence, 'high');
  assert.deepEqual(parsed.replacementLines.map((line) => line.sku), ['GOOD-1', 'GOOD-2']);
});

test('missing Replacement title is never guessed from arbitrary fields', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: 'SH: SH-1\nReplacement Unit: GOOD-1\nQty: 1\nERP Warehouse: 悉尼良品仓' });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(parsed.replacementLines, []);
});

test('malformed Replacement Qty needs confirmation and produces no line', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: 'SH: SH-1\nReplacement Unit information\nReplacement Unit: GOOD-1\nQty: many\nERP Warehouse: 悉尼良品仓' });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(parsed.replacementLines, []);
  assert(parsed.warnings.some((warning) => warning.startsWith('REPLACEMENT_QTY_INVALID')));
});

test('XLSX worksheet adapter core finds literal section and multiple source rows', () => {
  const parsed = parseXlsxWorkbookData({ sheets: [{ name: 'ERP', rows: [
    ['SH', 'SH-2'],
    ['Faulty Unit information'],
    ['SKU', 'Qty', 'ERP Warehouse'],
    ['BAD-1', 1, 'BAD'],
    ['Replacement Unit information'],
    ['SKU', 'Qty', 'ERP Warehouse'],
    ['GOOD-1', 1, '悉尼良品仓'],
    ['GOOD-2', 2, '悉尼物料仓'],
  ] }] }, 'fixture.xlsx');
  assert.equal(parsed.confidence, 'high');
  assert.deepEqual(parsed.replacementLines.map((line) => [line.sku, line.sourceRow]), [['GOOD-1', 7], ['GOOD-2', 8]]);
});
