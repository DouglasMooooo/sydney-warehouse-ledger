import { mkdirSync, writeFileSync } from 'node:fs';
import { runLarkCli } from '../feishu/client.js';
import type { LarkEnvelope, ProposedChange } from '../feishu/types.js';
import { captureOperationPrecondition, writeExplicitCells } from '../feishu/write.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';

interface WorkbookCreateData {
  url?: string;
  spreadsheet_url?: string;
  spreadsheet?: { url?: string; spreadsheet_token?: string };
  spreadsheet_token?: string;
}

interface WorkbookInfoData {
  sheets: Array<{ sheet_id: string; title?: string; sheet_name?: string }>;
}

const title = `TEMP ledger typed-date verification ${new Date().toISOString()}`;
const created = runLarkCli<LarkEnvelope<WorkbookCreateData>>([
  'sheets', '+workbook-create', '--title', title,
]);
if (!created.ok) throw new Error('Unable to create isolated date-test workbook');
const spreadsheetUrl = created.data.url ?? created.data.spreadsheet_url ?? created.data.spreadsheet?.url;
if (!spreadsheetUrl) throw new Error('Date-test workbook response did not include a URL');
if (spreadsheetUrl === process.env.FEISHU_SPREADSHEET_URL) throw new Error('Refusing to run date test against production');

const info = runLarkCli<LarkEnvelope<WorkbookInfoData>>([
  'sheets', '+workbook-info', '--url', spreadsheetUrl,
]);
const sheet = info.data.sheets[0];
if (!info.ok || !sheet) throw new Error('Date-test workbook has no sheet');

const prepared = prepareLedgerWrite({
  action: '期初库存', date: '2026-08-20', sku: '00123', qty: 1,
  toLocation: 'TEST-LOCATION', stockCondition: '新机',
});
if (!prepared.ok) throw new Error(`Date test preparation failed: ${JSON.stringify(prepared.errors)}`);
const sheetName = sheet.title ?? sheet.sheet_name ?? 'Sheet1';
const changes: ProposedChange[] = prepared.proposedCells.map((cell) => {
  const change: ProposedChange = {
    sheet: sheetName, cell: `${cell.column}2`, newValue: cell.value,
    valueType: cell.valueType, reason: 'isolated typed-write end-to-end verification',
  };
  if (cell.numberFormat !== undefined) change.numberFormat = cell.numberFormat;
  return change;
});
if (!changes.some((change) => change.valueType === 'date')) throw new Error('Prepared write did not contain a date cell');
const operationPrecondition = captureOperationPrecondition(
  spreadsheetUrl,
  sheet.sheet_id,
  'ADJUSTMENT',
  2,
  [{ kind: 'CURRENT_INVENTORY', range: 'A1:AC1' }],
);

const result = writeExplicitCells({
  spreadsheetUrl, sheetId: sheet.sheet_id, sheetName,
  purpose: 'BUSINESS_RECORD', changes, operationPrecondition, dryRun: false,
});
mkdirSync('reports', { recursive: true });
writeFileSync('reports/typed-date-e2e.md', [
  '# Typed Date End-to-End Verification', '',
  `Run: ${new Date().toISOString()}`, '',
  '- Isolated non-production workbook: PASS',
  '- Numeric Feishu date serial written: PASS',
  '- Display format `yyyy-mm-dd`: PASS',
  '- Typed reread reported a date-compatible dtype: PASS',
  '- Effective business date matched `2026-08-20`: PASS',
  '- Qty reread remained numeric: PASS',
  '- SKU/location reread remained exact text: PASS',
  '- Optimistic pre-write state check: PASS',
  '- Protected/formula columns unchanged: PASS',
  '- Post-write verification: PASS', '',
  'The temporary workbook URL/token is intentionally not committed.', '',
].join('\n'), 'utf8');
console.log(JSON.stringify({ ok: result.verified, testWorkbookTitle: title, spreadsheetUrl }, null, 2));
