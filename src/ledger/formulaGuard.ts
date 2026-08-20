import type { FeishuCell, ProposedChange } from '../feishu/types.js';

export const CONFIRMED_FORMULA_REPAIR_CELLS = [
  'H1653', 'I1653', 'AB1654', 'AC1654', 'AB1655', 'AC1655', 'AB1656', 'AC1656',
] as const;

export type ConfirmedFormulaCell = (typeof CONFIRMED_FORMULA_REPAIR_CELLS)[number];

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
