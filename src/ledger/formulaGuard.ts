import { PROTECTED_COLUMNS, type ProtectedColumn } from '../config/ledgerSchema.js';
import type { FeishuCell, ProposedChange } from '../feishu/types.js';

export const CONFIRMED_FORMULA_REPAIR_CELLS = [
  'H1653', 'I1653', 'AB1654', 'AC1654', 'AB1655', 'AC1655', 'AB1656', 'AC1656',
] as const;

export type ConfirmedFormulaCell = (typeof CONFIRMED_FORMULA_REPAIR_CELLS)[number];

export interface FutureRowFormulaPlan {
  targetRow: number;
  requiredFormulaAddresses: string[];
  repairs: ProposedChange[];
}

const addressPattern = /^([A-Z]+)(\d+)$/;

function patternFor(formula: string, sourceRow: number): string {
  return formula.replace(/(\$?[A-Z]{1,2})(\$?)(\d+)/g, (whole, column: string, absoluteRow: string, rowText: string) => {
    if (absoluteRow === '$' || Number(rowText) !== sourceRow) return whole;
    return `${column}{row}`;
  });
}

export function inferRelativeFormula(previous: string, previousRow: number, next: string, nextRow: number, targetRow: number): string {
  const previousPattern = patternFor(previous, previousRow);
  const nextPattern = patternFor(next, nextRow);
  if (previousPattern !== nextPattern) throw new Error(`Neighbour formula patterns differ at row ${targetRow}`);
  const formula = previousPattern.replaceAll('{row}', String(targetRow));
  if (!formula.includes(String(targetRow))) throw new Error(`Formula for row ${targetRow} has no row-relative reference`);
  return formula;
}

export function buildFormulaRepairChanges(cells: Map<string, FeishuCell>): ProposedChange[] {
  return CONFIRMED_FORMULA_REPAIR_CELLS.map((address) => {
    const match = addressPattern.exec(address)!;
    const column = match[1]!;
    const row = Number(match[2]);
    const target = cells.get(address) ?? {};
    if (target.formula) throw new Error(`${address} is no longer a formula gap`);
    const previousNeighbour = nearestFormula(cells, column, row, -1);
    const nextNeighbour = nearestFormula(cells, column, row, 1);
    if (!previousNeighbour || !nextNeighbour) throw new Error(`Missing neighbour formula for ${address}`);
    const change: ProposedChange = {
      sheet: '主表 库存流水', cell: address, old: target.value ?? '',
      newFormula: inferRelativeFormula(
        previousNeighbour.formula, previousNeighbour.row,
        nextNeighbour.formula, nextNeighbour.row, row,
      ),
      reason: 'confirmed formula gap',
    };
    if (target.formula !== undefined) change.oldFormula = target.formula;
    return change;
  });
}

/**
 * Plans only formula repairs for a confirmed future append row. It never copies
 * business values, and a formula is inferred only when two nearby formula
 * patterns agree. Existing style and data validation are preserved because the
 * resulting changes contain formula only.
 */
export function planFutureRowFormulaTemplate(
  cells: Map<string, FeishuCell>,
  targetRow: number,
  targetIsConfirmedNewRow: boolean,
  columns: readonly ProtectedColumn[] = PROTECTED_COLUMNS,
): FutureRowFormulaPlan {
  if (!targetIsConfirmedNewRow) throw new Error('Formula template planning is restricted to confirmed future rows');
  if (!Number.isInteger(targetRow) || targetRow < 2) throw new Error('Invalid future target row');

  const requiredFormulaAddresses: string[] = [];
  const repairs: ProposedChange[] = [];
  for (const column of columns) {
    const neighbours = nearbyFormulas(cells, column, targetRow);
    const targetAddress = `${column}${targetRow}`;
    const target = cells.get(targetAddress) ?? {};
    if (neighbours.length === 0) {
      if (target.formula) throw new Error(`Unexpected formula in ${targetAddress} without a confirmed template`);
      continue;
    }
    if (neighbours.length < 2) throw new Error(`Insufficient neighbouring formula evidence for ${targetAddress}`);
    const inferred = inferRelativeFormula(
      neighbours[0]!.formula, neighbours[0]!.row,
      neighbours[1]!.formula, neighbours[1]!.row,
      targetRow,
    );
    requiredFormulaAddresses.push(targetAddress);
    if (target.formula) {
      if (patternFor(target.formula, targetRow) !== patternFor(inferred, targetRow)) {
        throw new Error(`Existing formula pattern differs in ${targetAddress}`);
      }
      continue;
    }
    repairs.push({
      sheet: '主表 库存流水',
      cell: targetAddress,
      old: target.value ?? '',
      newFormula: inferred,
      reason: 'confirmed future-row formula template gap',
    });
  }
  return { targetRow, requiredFormulaAddresses, repairs };
}

function nearestFormula(
  cells: Map<string, FeishuCell>, column: string, row: number, direction: -1 | 1,
): { row: number; formula: string } | undefined {
  for (let distance = 1; distance <= 25; distance += 1) {
    const candidateRow = row + distance * direction;
    const formula = cells.get(`${column}${candidateRow}`)?.formula;
    if (formula) return { row: candidateRow, formula };
  }
  return undefined;
}

function nearbyFormulas(
  cells: Map<string, FeishuCell>, column: string, targetRow: number,
): Array<{ row: number; formula: string }> {
  const result: Array<{ row: number; formula: string }> = [];
  for (let distance = 1; distance <= 25 && result.length < 2; distance += 1) {
    for (const row of [targetRow - distance, targetRow + distance]) {
      if (row < 1) continue;
      const formula = cells.get(`${column}${row}`)?.formula;
      if (formula) result.push({ row, formula });
      if (result.length === 2) break;
    }
  }
  return result;
}
