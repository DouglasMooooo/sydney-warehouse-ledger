import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareReturnBatchPreview, prepareReturnSnBatchPreview, RETURN_REPAIR_LOCATION } from '../src/application/returnBatchPreview.js';
import { parseReturnXlsxWorkbookData } from '../src/workOrders/returnXlsxParser.js';

test('live RMA Faulty Unit rows become a REPAIR-01 read-only batch preview', () => {
  const parsed = parseReturnXlsxWorkbookData({ sheets: [{ name: 'Sheet1', rows: [
    ['* SH Ticket No.(ZOHO):', 'SH-2608-00184741'],
    ['Faulty Unit Information'],
    ['*Type of Product:', '*Model Name:', '*Product SN:', '#1Part No. /料号', '*Fault Description'],
    ['Battery', 'EQ4800-S', '60E5S48063VA278', '97-223-00065-00', 'fault'],
    [],
    ['Replacement Unit information'],
    ['*Type of Product:', '*Model Name:', '#1Part No. /料号', '*Qty:', '#1 Note（Stock of warehouse ）'],
    ['Battery', 'EQ4800-S', 'REPLACEMENT-MUST-NOT-LEAK', 1, '悉尼良品仓'],
  ] }] }, 'rma.xlsx');
  const preview = prepareReturnBatchPreview(parsed, '2026-08-25');
  assert.equal(preview.zeroWritesPerformed, true);
  assert.equal(preview.targetLocation, RETURN_REPAIR_LOCATION);
  assert.deepEqual(preview.lines, [{
    sourceRow: 4, action: '退回维修', businessDate: '2026-08-25', sh: 'SH-2608-00184741',
    sku: '97-223-00065-00', model: 'EQ4800-S', sn: '60E5S48063VA278', qty: 1,
    targetLocation: 'REPAIR-01', stockCondition: '待修', valid: true, errors: [],
  }]);
});

test('return batch fails closed when Faulty header or serialized quantity is invalid', () => {
  const parsed = parseReturnXlsxWorkbookData({ sheets: [{ name: 'RMA', rows: [
    ['Faulty Unit Information'], ['Product SN', 'Qty'], ['SN-1', 2],
  ] }] });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(prepareReturnBatchPreview(parsed, '2026-08-25').lines, []);
});

test('SN-only return intake trims, deduplicates, and defaults every unit to REPAIR-01', () => {
  const preview = prepareReturnSnBatchPreview(' SN-1\nSN-2\nSN-1 ', '2026-08-25');
  assert.deepEqual(preview.lines.map((line) => ({ sn: line.sn, qty: line.qty, location: line.targetLocation, condition: line.stockCondition })), [
    { sn: 'SN-1', qty: 1, location: 'REPAIR-01', condition: '待修' },
    { sn: 'SN-2', qty: 1, location: 'REPAIR-01', condition: '待修' },
  ]);
  assert.deepEqual(preview.warnings, ['DUPLICATE_SN_SKIPPED:SN-1']);
  assert.throws(() => prepareReturnSnBatchPreview('  ', '2026-08-25'), /至少输入一个 SN/);
  assert.throws(() => prepareReturnSnBatchPreview(Array.from({ length: 501 }, (_, index) => `SN-${index}`), '2026-08-25'), /最多处理 500/);
});
