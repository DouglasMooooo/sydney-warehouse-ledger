import { readCells } from '../feishu/read.js';
import { buildFormulaRepairChanges, CONFIRMED_FORMULA_REPAIR_CELLS } from '../ledger/formulaGuard.js';
import { captureSnapshot, saveSnapshot } from '../ledger/reconciliation.js';
import { productionConfig } from './config.js';

export const BEFORE_PATH = '.phase1/before.json';

export function prepareFormulaPlan(captureBefore = false) {
  const config = productionConfig();
  if (captureBefore) saveSnapshot(BEFORE_PATH, captureSnapshot(config));
  const cells = readCells({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.mainSheetId,
    range: 'H1652:AC1658', include: ['formula'],
  });
  const changes = buildFormulaRepairChanges(cells);
  if (changes.length !== 8 || changes.some((change) => !CONFIRMED_FORMULA_REPAIR_CELLS.includes(change.cell as never))) {
    throw new Error('Formula repair plan escaped the confirmed eight-cell allowlist');
  }
  return { config, changes };
}
