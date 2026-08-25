import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareReturnBatchPreview, RETURN_REPAIR_LOCATION } from '../src/application/returnBatchPreview.js';
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
