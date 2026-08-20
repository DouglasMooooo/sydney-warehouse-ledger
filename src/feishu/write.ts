import { assertColumnWriteAllowed } from '../config/ledgerSchema.js';
import { runLarkCli } from './client.js';
import { readCells } from './read.js';
import type { ExplicitWriteRequest, LarkEnvelope } from './types.js';

const addressPattern = /^([A-Z]+)([1-9]\d*)$/;

export interface WriteResult {
  dryRun: boolean;
  sheet: string;
  changes: ExplicitWriteRequest['changes'];
  verified: boolean;
}

export function writeExplicitCells(request: ExplicitWriteRequest): WriteResult {
  if (request.changes.length === 0) throw new Error('No changes proposed');
  const seen = new Set<string>();
  for (const change of request.changes) {
    const match = addressPattern.exec(change.cell);
    if (!match) throw new Error(`Invalid cell address ${change.cell}`);
    assertColumnWriteAllowed(match[1]!, request.purpose);
    if (seen.has(change.cell)) throw new Error(`Duplicate target ${change.cell}`);
    seen.add(change.cell);
    if ((change.newFormula === undefined) === (change.newValue === undefined)) {
      throw new Error(`Exactly one of newFormula/newValue is required for ${change.cell}`);
    }
  }
  if (request.dryRun) {
    return { dryRun: true, sheet: request.sheetName, changes: request.changes, verified: false };
  }

  const operations = request.changes.map((change) => ({
    shortcut: '+cells-set',
    input: {
      sheet_id: request.sheetId,
      range: change.cell,
      cells: [[change.newFormula === undefined
        ? { value: change.newValue }
        : { formula: change.newFormula }]],
    },
  }));
  const response = runLarkCli<LarkEnvelope<unknown>>([
    'sheets', '+batch-update', '--url', request.spreadsheetUrl, '--yes', '--operations', '-',
  ], JSON.stringify(operations));
  if (!response.ok) throw new Error('Feishu batch write failed');

  const reread = readCells({
    spreadsheetUrl: request.spreadsheetUrl,
    sheetId: request.sheetId,
    range: boundingRange(request.changes.map((change) => change.cell)),
    include: ['formula'],
  });
  for (const change of request.changes) {
    const actual = reread.get(change.cell);
    if (change.newFormula !== undefined && actual?.formula !== change.newFormula) {
      throw new Error(`Post-write formula verification failed for ${change.cell}`);
    }
    if (change.newValue !== undefined && actual?.value !== change.newValue) {
      throw new Error(`Post-write value verification failed for ${change.cell}`);
    }
  }
  return { dryRun: false, sheet: request.sheetName, changes: request.changes, verified: true };
}

function columnNumber(column: string): number {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function numberColumn(value: number): string {
  let current = value;
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function boundingRange(addresses: string[]): string {
  const parsed = addresses.map((address) => {
    const match = addressPattern.exec(address)!;
    return { column: columnNumber(match[1]!), row: Number(match[2]) };
  });
  const minColumn = Math.min(...parsed.map((item) => item.column));
  const maxColumn = Math.max(...parsed.map((item) => item.column));
  const minRow = Math.min(...parsed.map((item) => item.row));
  const maxRow = Math.max(...parsed.map((item) => item.row));
  return `${numberColumn(minColumn)}${minRow}:${numberColumn(maxColumn)}${maxRow}`;
}
