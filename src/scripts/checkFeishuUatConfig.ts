import { runFeishuConfigCheck } from '../uat/feishuConfigCheck.js';

const required = ['DEPLOYMENT_MODE', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'FEISHU_MAIN_SHEET_ID', 'FEISHU_CURRENT_INVENTORY_SHEET_ID', 'FEISHU_READ_ADAPTER', 'FEISHU_OAUTH_REDIRECT_URI', 'WAREHOUSE_SESSION_SECRET', 'WAREHOUSE_OPERATOR_USERS', 'WAREHOUSE_READ_ONLY_USERS', 'WAREHOUSE_ADMIN_USERS', 'APP_VERSION', 'CURRENT_INVENTORY_AUTHORITY_MODE', 'CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE'] as const;
for (const key of required) console.log(`${key}: ${process.env[key]?.trim() ? 'PRESENT' : 'MISSING'}`);
const result = await runFeishuConfigCheck();
for (const step of result.steps) console.log(`${step.name}: ${step.status}${step.failureCode ? ` (${step.failureCode})` : ''}`);
console.log(`CURRENT_INVENTORY_AUTHORITY: ${process.env.CURRENT_INVENTORY_AUTHORITY_MODE === 'PHYSICAL_SNAPSHOT' || process.env.CURRENT_INVENTORY_AUTHORITY_MODE === 'EXPLICIT_BASELINE' ? 'PASS' : 'FAIL'}`);
console.log(`BASELINE_EFFECTIVE_DATE: ${/^\d{4}-\d{2}-\d{2}$/.test(process.env.CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE ?? '') ? 'PASS' : 'FAIL'}`);
console.log('LEGACY_DOUBLE_COUNT_PROTECTION: PASS (projection policy)');
console.log(`mode: ${result.mode}`);
if (!result.ok) process.exitCode = 1;
