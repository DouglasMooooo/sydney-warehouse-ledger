import { mkdirSync, writeFileSync } from 'node:fs';
import { cellsByAddress, readRange } from '../feishu/read.js';
import { cellRecord } from '../quality/rules.js';
import { publicReport, reportMarkdown, scanLedger } from '../quality/scanLedger.js';
import type { LedgerScanRow } from '../quality/types.js';
import { productionConfig } from './config.js';

const config = productionConfig();
const rows: LedgerScanRow[] = [];
const LAST_PHYSICAL_ROW = 2342;
const CHUNK_SIZE = 100;
for (let start = 1; start <= LAST_PHYSICAL_ROW; start += CHUNK_SIZE) {
  const end = Math.min(start + CHUNK_SIZE - 1, LAST_PHYSICAL_ROW);
  const data = readRange({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.mainSheetId,
    range: `A${start}:AC${end}`, include: ['formula', 'data_validation'],
  });
  for (const range of data.ranges) {
    range.cells.forEach((cells, offset) => {
      const row = range.row_indices[offset];
      if (row !== undefined) rows.push({ row, cells: cellRecord(range.col_indices, cells) });
    });
  }
}

const inventory = cellsByAddress(readRange({
  spreadsheetUrl: config.spreadsheetUrl, sheetId: config.currentInventorySheetId,
  range: 'N1:N1000', include: ['value'],
}));
const validLocations = new Set<string>();
for (let row = 2; row <= 1000; row += 1) {
  const location = inventory.get(`N${row}`)?.value;
  if (typeof location === 'string' && location.trim()) validLocations.add(location.trim());
}

const report = scanLedger(rows.filter((row) => row.row > 1), validLocations);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/data-quality-latest.json', `${JSON.stringify(publicReport(report), null, 2)}\n`, 'utf8');
writeFileSync('reports/data-quality-latest.md', reportMarkdown(report), 'utf8');
console.log(JSON.stringify({ scannedRows: report.scannedRows, counts: report.counts }, null, 2));
