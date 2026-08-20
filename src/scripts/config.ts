import { requiredEnv } from '../feishu/client.js';
import type { SnapshotConfig } from '../ledger/reconciliation.js';

export function productionConfig(): SnapshotConfig {
  return {
    spreadsheetUrl: requiredEnv('FEISHU_SPREADSHEET_URL'),
    mainSheetId: requiredEnv('FEISHU_MAIN_SHEET_ID'),
    weeklySheetId: requiredEnv('FEISHU_WEEKLY_SHEET_ID'),
    monthlySheetId: requiredEnv('FEISHU_MONTHLY_SHEET_ID'),
    currentInventorySheetId: requiredEnv('FEISHU_CURRENT_INVENTORY_SHEET_ID'),
  };
}
