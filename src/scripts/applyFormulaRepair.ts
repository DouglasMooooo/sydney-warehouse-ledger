import { existsSync } from 'node:fs';
import { writeExplicitCells } from '../feishu/write.js';
import { businessCellsUnchanged, captureSnapshot, loadSnapshot, saveSnapshot } from '../ledger/reconciliation.js';
import { BEFORE_PATH, prepareFormulaPlan } from './formulaPlan.js';

if (!existsSync(BEFORE_PATH)) throw new Error('Missing BEFORE snapshot; run formula:dry-run first');
const before = loadSnapshot(BEFORE_PATH);
const { config, changes } = prepareFormulaPlan(false);
console.log(JSON.stringify({ sheet: '主表 库存流水', changes }, null, 2));
const result = writeExplicitCells({
  spreadsheetUrl: config.spreadsheetUrl, sheetId: config.mainSheetId,
  sheetName: '主表 库存流水', purpose: 'FORMULA_REPAIR', changes, dryRun: false,
});
const after = captureSnapshot(config);
saveSnapshot('.phase1/after.json', after);
if (!businessCellsUnchanged(before, after)) throw new Error('A business cell changed; stop immediately');
console.log(JSON.stringify({ ...result, businessCellsUnchanged: true }, null, 2));
