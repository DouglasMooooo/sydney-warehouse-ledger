import { assertMainLedgerSchema } from '../config/ledgerSchema.js';
import { requiredEnv } from '../feishu/client.js';
import { openApiClientFromEnv } from '../feishu/openApiClient.js';
import { FeishuOpenApiWarehouseSheetReader } from '../feishu/sheetReader.js';

const token = requiredEnv('FEISHU_SPREADSHEET_TOKEN');
const sheetId = requiredEnv('FEISHU_MAIN_SHEET_ID');
const reader = new FeishuOpenApiWarehouseSheetReader(token, openApiClientFromEnv());
const table = await reader.readTable({ sheetId, range: 'A1:AC1' });
assertMainLedgerSchema(table.columns);
console.log('operationalLedgerSchema: PASS');
