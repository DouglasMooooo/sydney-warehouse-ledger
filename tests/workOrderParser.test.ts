import assert from 'node:assert/strict';
import test from 'node:test';
import { identifySectionHeading, normalizeSectionHeading, WORK_ORDER_SECTION } from '../src/workOrders/sectionHeadings.js';
import { parsePlainTextWorkOrder } from '../src/workOrders/textParser.js';
import { parseXlsxWorkbookData } from '../src/workOrders/xlsxParser.js';

const valid = 'SH: SH-1\nFaulty Unit information\nSKU: BAD-1\nQty: 1\nERP Warehouse: BAD\nReplacement Unit information\nReplacement Unit: GOOD-1\nQty: 2\nERP Warehouse: 悉尼物料仓';

test('shared section detector normalizes whitespace, case, and colon variants', () => {
  assert.equal(normalizeSectionHeading('  Replacement   Unit information：  '), 'replacement unit information');
  for (const heading of [
    'Replacement Unit information', 'Replacement Unit information:',
    'Replacement Unit information：', ' replacement unit information ',
  ]) assert.equal(identifySectionHeading(heading), WORK_ORDER_SECTION.REPLACEMENT_UNIT);
  for (const heading of [
    'Faulty Unit information', 'Faulty Unit information:',
    'Faulty Unit information：', ' faulty unit information ',
  ]) assert.equal(identifySectionHeading(heading), WORK_ORDER_SECTION.FAULTY_UNIT);
  assert.equal(identifySectionHeading('Shipping information:'), WORK_ORDER_SECTION.OTHER);
  assert.equal(identifySectionHeading('SKU: GOOD-1'), undefined);
});

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

for (const colon of [':', '：'] as const) {
  test(`Faulty section with ${colon === ':' ? 'English' : 'Chinese'} colon terminates Replacement immediately`, () => {
    const parsed = parsePlainTextWorkOrder({ sourceText: [
      `Replacement Unit information${colon}`,
      'SKU: GOOD-001', 'Qty: 1', 'ERP Warehouse: 悉尼良品仓',
      `Faulty Unit information${colon}`,
      'SKU: BAD-001', 'Qty: 1', 'ERP Warehouse: 悉尼良品仓',
    ].join('\n') });
    assert.equal(parsed.confidence, 'high');
    assert.deepEqual(parsed.replacementLines.map((line) => line.sku), ['GOOD-001']);
  });
}

test('arbitrary recognized section terminates Replacement parsing', () => {
  const parsed = parsePlainTextWorkOrder({ sourceText: [
    'Replacement Unit information',
    'SKU: GOOD-001', 'Qty: 1', 'ERP Warehouse: 悉尼良品仓',
    'Shipping information:',
    'SKU: LEAK-001', 'Qty: 9', 'ERP Warehouse: 悉尼物料仓',
  ].join('\n') });
  assert.deepEqual(parsed.replacementLines.map((line) => line.sku), ['GOOD-001']);
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

test('XLSX parser uses shared headings and stops before Faulty rows', () => {
  const parsed = parseXlsxWorkbookData({ sheets: [{ name: 'ERP', rows: [
    ['Replacement Unit information：'],
    ['SKU', 'Qty', 'ERP Warehouse'],
    ['GOOD-1', 1, '悉尼良品仓'],
    ['Faulty Unit information：'],
    ['SKU', 'Qty', 'ERP Warehouse'],
    ['BAD-1', 1, '悉尼良品仓'],
  ] }] });
  assert.equal(parsed.confidence, 'high');
  assert.deepEqual(parsed.replacementLines, [{ sku: 'GOOD-1', qty: 1, erpWarehouse: '悉尼良品仓', sourceRow: 3 }]);
});

test('XLSX malformed replacement rows warn and never invent values', () => {
  const parsed = parseXlsxWorkbookData({ sheets: [{ name: 'ERP', rows: [
    ['Replacement Unit information:'],
    ['SKU', 'Qty', 'ERP Warehouse'],
    ['GOOD-1', 'many', '悉尼良品仓'],
    ['GOOD-2', 2, ''],
  ] }] });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(parsed.replacementLines, []);
  assert.equal(parsed.warnings.length, 2);
});

test('blank row terminates Replacement parsing and later rows are never guessed', () => {
  const parsed = parseXlsxWorkbookData({ sheets: [{ name: 'WO', rows: [
    ['Replacement Unit information'], ['SKU', 'Qty', 'ERP Warehouse'], ['GOOD', 1, '悉尼良品仓'], [],
    ['FAULTY-MUST-NOT-LEAK', 1, '悉尼良品仓'],
  ] }] });
  assert.deepEqual(parsed.replacementLines.map((line) => line.sku), ['GOOD']);
});
