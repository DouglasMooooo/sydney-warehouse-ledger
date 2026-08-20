import { mkdirSync, writeFileSync } from 'node:fs';
import { compareOpenApiLogicalReads } from '../uat/openApiParity.js';
import { FeishuWarehouseReadAdapter } from '../feishu/warehouseReadAdapter.js';
import { warehouseSheetReaderFromEnv } from '../feishu/sheetReader.js';
import { todayInSydney } from '../ledger/businessDate.js';
import { validateUatRuntimeConfig } from '../config/runtimeConfig.js';

validateUatRuntimeConfig();
if (!process.env.FEISHU_SPREADSHEET_URL?.trim()) throw new Error('Trusted local parity requires FEISHU_SPREADSHEET_URL.');
const config = { spreadsheetUrl: process.env.FEISHU_SPREADSHEET_URL, mainSheetId: process.env.FEISHU_MAIN_SHEET_ID!, currentInventorySheetId: process.env.FEISHU_CURRENT_INVENTORY_SHEET_ID! };
const trusted = new FeishuWarehouseReadAdapter(config, warehouseSheetReaderFromEnv({ ...process.env, FEISHU_READ_ADAPTER: 'lark-cli' }));
const hosted = new FeishuWarehouseReadAdapter(config, warehouseSheetReaderFromEnv({ ...process.env, FEISHU_READ_ADAPTER: 'openapi' }));
const result = await compareOpenApiLogicalReads(trusted, hosted, todayInSydney(), process.env.UAT_PARITY_PRODUCT_SKU?.trim());
mkdirSync('reports/private', { recursive: true });
writeFileSync('reports/private/openapi-read-parity.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: result.status, checks: result.checks.map(({ name, status, differenceCount }) => ({ name, status, differenceCount })) }));
if (result.status === 'FAIL') process.exitCode = 1;
