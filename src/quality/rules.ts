import { isLedgerAction, isStockCondition } from '../config/controlledValues.js';
import type { FeishuCell } from '../feishu/types.js';
import type { LedgerScanRow, QualityIssue, QualityCode } from './types.js';

const hiddenPattern = /(^\s|\s$|[\r\n\t\u200B-\u200D\u2060\uFEFF])/;
const formulaErrors = /^(#REF!|#VALUE!|#NAME\?|#N\/A|#DIV\/0!|#NUM!|~CIRCULAR~REF~)/;
const identityColumns = ['D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'P'];
const formulaColumns = ['H', 'I', 'O', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z', 'AA'];

const value = (row: LedgerScanRow, column: string): unknown => row.cells[column]?.value;
const text = (row: LedgerScanRow, column: string): string => String(value(row, column) ?? '').trim();
const issue = (code: QualityCode, row: number, column: string, evidence: string, severity: 'ERROR' | 'WARNING' = 'ERROR'): QualityIssue => ({
  severity, code, sheet: '主表 库存流水', row, column, evidence,
  suggestedAction: 'Review only; do not bulk-fix historical rows.',
});

export function scanRow(row: LedgerScanRow, validLocations: ReadonlySet<string>): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const action = text(row, 'C');
  const condition = text(row, 'P');
  if (!action && row.row > 1) return issues;

  for (const column of ['A', 'B']) {
    const cell = row.cells[column];
    if (typeof cell?.value === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(cell.value) &&
      (cell.value_type === 'text' || cell.data_type === 'text')) {
      issues.push(issue('DATE_STORED_AS_TEXT', row.row, column, 'Date cell is stored as text.'));
    }
  }
  for (const column of identityColumns) {
    const raw = value(row, column);
    if (typeof raw === 'string' && hiddenPattern.test(raw)) {
      issues.push(issue('HIDDEN_CHARACTER', row.row, column, 'Identifier contains boundary or hidden whitespace.', 'WARNING'));
    }
  }
  if (!isLedgerAction(action)) issues.push(issue('INVALID_ACTION', row.row, 'C', 'Action is outside the controlled list.'));
  if (!isStockCondition(condition)) issues.push(issue('INVALID_STOCK_CONDITION', row.row, 'P', 'Stock condition is outside the controlled list.'));
  for (const column of ['L', 'M']) {
    const location = text(row, column);
    if (location && validLocations.size > 0 && !validLocations.has(location)) {
      issues.push(issue('INVALID_LOCATION', row.row, column, 'Location is absent from the supplied location master.'));
    }
  }
  const qty = value(row, 'K');
  const numericQty = typeof qty === 'number' ? qty : Number.NaN;
  if (!Number.isFinite(numericQty) || numericQty <= 0 || (text(row, 'J') !== '' && numericQty !== 1)) {
    issues.push(issue('INVALID_QTY', row.row, 'K', 'Qty is not a valid positive numeric quantity.'));
  }
  if (!text(row, 'G') && action !== '退回维修') issues.push(issue('MISSING_SKU', row.row, 'G', 'SKU is required for this action.'));
  if (action === '退回维修' && !text(row, 'J')) issues.push(issue('MISSING_SN', row.row, 'J', 'Return to Repair requires SN.'));
  if (action === '备货' && !text(row, 'L')) issues.push(issue('PREPARED_WITHOUT_SOURCE_LOCATION', row.row, 'L', 'Prepared row has no source location.'));
  if (action === '备货' && !text(row, 'E')) issues.push(issue('PREPARED_WITHOUT_PICKUP_CODE', row.row, 'E', 'Prepared row has no Pickup Code.'));
  if (action === '出库' && condition !== '物料' && !text(row, 'J')) issues.push(issue('PRODUCT_OUTBOUND_WITHOUT_SN', row.row, 'J', 'Product outbound row has no SN.'));
  if (action === '退回维修' && !text(row, 'M')) issues.push(issue('RETURN_WITHOUT_TARGET_LOCATION', row.row, 'M', 'Return row has no target location.'));
  if (action === '移库' && !text(row, 'L')) issues.push(issue('MOVE_WITHOUT_SOURCE', row.row, 'L', 'Move row has no source.'));
  if (action === '移库' && !text(row, 'M')) issues.push(issue('MOVE_WITHOUT_TARGET', row.row, 'M', 'Move row has no target.'));

  if (row.row >= 1352) {
    const expected = [...formulaColumns, ...(row.row >= 1486 ? ['AB', 'AC'] : [])];
    for (const column of expected) {
      const cell = row.cells[column] ?? {};
      if (!cell.formula) issues.push(issue('FORMULA_MISSING', row.row, column, 'Expected protected formula is absent.'));
      if (typeof cell.value === 'string' && formulaErrors.test(cell.value)) {
        issues.push(issue('FORMULA_BROKEN', row.row, column, 'Protected formula evaluates to an error.'));
      }
    }
  }
  for (const column of ['O', 'W']) {
    const result = text(row, column);
    if (result && result !== '正常' && result !== '通过') issues.push(issue('VALIDATION_NOT_OK', row.row, column, 'Validation result is not OK.'));
  }
  return issues;
}

export function cellRecord(columns: string[], cells: FeishuCell[]): Record<string, FeishuCell> {
  return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? {}]));
}
