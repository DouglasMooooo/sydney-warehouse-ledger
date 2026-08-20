import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { ExcelJsWorkbookReader, MAX_WORK_ORDER_XLSX_BYTES, validateXlsxUpload, XlsxUploadError } from '../src/workOrders/excelJsReader.js';
import { XlsxWorkOrderParser } from '../src/workOrders/xlsxParser.js';
import { prepareParsedWorkOrderBatchPreview } from '../src/application/workOrderBatchPreview.js';
import type { WarehouseReadPort } from '../src/application/contracts.js';

async function workbookBytes(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ERP');
  for (const row of rows) sheet.addRow(row);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes as ArrayBuffer);
}

test('real XLSX bytes decode server-side and Faulty never leaks into Replacement', async () => {
  const bytes = await workbookBytes([
    ['SH: SH-XLSX-1'],
    ['Faulty Unit information:'], ['SKU', 'Qty', 'ERP Warehouse'], ['BAD-1', 1, '悉尼良品仓'],
    ['Replacement Unit information：'], ['SKU', 'Qty', 'ERP Warehouse'],
    ['GOOD-1', 1, '悉尼良品仓'], ['GOOD-2', 2, '悉尼物料仓'],
    ['Faulty Unit information：'], ['SKU', 'Qty', 'ERP Warehouse'], ['BAD-2', 1, '悉尼良品仓'],
  ]);
  const parsed = await new XlsxWorkOrderParser(new ExcelJsWorkbookReader()).parse({ bytes, sourceFileName: 'work-order.xlsx' });
  assert.equal(parsed.confidence, 'high');
  assert.equal(parsed.shNo, 'SH-XLSX-1');
  assert.deepEqual(parsed.replacementLines.map((line) => [line.sku, line.sourceRow]), [['GOOD-1', 7], ['GOOD-2', 8]]);
});

test('unsupported extension, oversized upload, and malformed workbook are rejected', async () => {
  assert.throws(() => validateXlsxUpload('work-order.xls', 100), (error: unknown) => error instanceof XlsxUploadError && error.code === 'UNSUPPORTED_FILE_TYPE');
  assert.throws(() => validateXlsxUpload('work-order.xlsx', MAX_WORK_ORDER_XLSX_BYTES + 1), (error: unknown) => error instanceof XlsxUploadError && error.code === 'FILE_TOO_LARGE');
  await assert.rejects(() => new ExcelJsWorkbookReader().read(new TextEncoder().encode('not xlsx')), (error: unknown) => error instanceof XlsxUploadError && error.code === 'XLSX_DECODE_FAILED');
});

test('unsupported workbook layout fails closed', async () => {
  const bytes = await workbookBytes([['SH: SH1'], ['Some other information'], ['SKU', 'Qty'], ['GOOD', 1]]);
  const parsed = await new XlsxWorkOrderParser(new ExcelJsWorkbookReader()).parse({ bytes });
  assert.equal(parsed.confidence, 'needs_confirmation');
  assert.deepEqual(parsed.replacementLines, []);
});

test('decoded multi-line XLSX preview uses current inventory and remains zero-write', async () => {
  const bytes = await workbookBytes([
    ['SH: SH1'], ['Replacement Unit information'], ['SKU', 'Qty', 'ERP Warehouse'],
    ['GOOD-1', 1, '悉尼良品仓'], ['GOOD-2', 2, '悉尼物料仓'],
  ]);
  const parsed = await new XlsxWorkOrderParser(new ExcelJsWorkbookReader()).parse({ bytes, sourceFileName: 'order.xlsx' });
  const port: WarehouseReadPort = {
    async readDashboardSource() { throw new Error('not used'); },
    async findProduct(sku) { return { sku, model: `MODEL-${sku}` }; },
    async findAvailableInventory(sku, condition) {
      return [{ sku, model: `MODEL-${sku}`, location: `LOC-${sku}`, availableQty: 5, condition }];
    },
    async readPickupCodes() { return ['SYD-00001']; },
  };
  const preview = await prepareParsedWorkOrderBatchPreview(parsed, '2026-08-20', port);
  assert.equal(preview.lines.length, 2);
  assert(preview.lines.every((line) => line.preview.zeroWritesPerformed));
  assert.deepEqual(preview.lines.map((line) => line.preview.proposedPreparedRow?.fromLocation), ['LOC-GOOD-1', 'LOC-GOOD-2']);
  assert(preview.lines.every((line) => line.preview.pickupCode?.committed === false));
});
