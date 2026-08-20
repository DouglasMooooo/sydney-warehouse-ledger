import { writeExplicitCells } from '../feishu/write.js';
import { prepareFormulaPlan } from './formulaPlan.js';

const { config, changes } = prepareFormulaPlan(true);
const result = writeExplicitCells({
  spreadsheetUrl: config.spreadsheetUrl, sheetId: config.mainSheetId,
  sheetName: '主表 库存流水', purpose: 'FORMULA_REPAIR', changes, dryRun: true,
});
console.log(JSON.stringify(result, null, 2));
