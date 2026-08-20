import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { runPrivateFixtureRegression } from '../src/workOrders/privateFixtureRegression.js';

test('private fixture runner reports only safe fixture ordinals and exact outcomes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-private-fixtures-'));
  mkdirSync(root, { recursive: true });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('WO');
  sheet.addRows([['SH: PRIVATE-SH'], ['Replacement Unit information'], ['SKU', 'Qty', 'ERP Warehouse'], ['PRIVATE-SKU', 1, '悉尼良品仓']]);
  await workbook.xlsx.writeFile(join(root, 'sensitive-name.xlsx'));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify([{ file: 'sensitive-name.xlsx', expectedSh: 'PRIVATE-SH', replacementLines: [{ sku: 'PRIVATE-SKU', qty: 1, erpWarehouse: '悉尼良品仓' }] }]));
  const summary = await runPrivateFixtureRegression(root);
  assert.equal(summary.exactPass, 1);
  assert.deepEqual(summary.results, [{ fixture: 'fixture-001', outcome: 'PASS' }]);
  assert(!JSON.stringify(summary).includes('PRIVATE-SKU'));
});
