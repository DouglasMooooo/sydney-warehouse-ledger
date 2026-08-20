import type { FeishuCell } from '../feishu/types.js';

export const STALE_WRITE_CONFLICT = 'STALE_WRITE_CONFLICT' as const;

export interface LedgerStateSnapshot {
  range: string;
  revision?: number;
  fingerprint: string;
}

export class StaleWriteConflictError extends Error {
  readonly code = STALE_WRITE_CONFLICT;

  constructor(
    readonly expected: LedgerStateSnapshot,
    readonly actual: LedgerStateSnapshot,
  ) {
    super(STALE_WRITE_CONFLICT);
  }
}

export function createLedgerStateSnapshot(
  range: string,
  cells: Map<string, FeishuCell>,
  revision?: number,
): LedgerStateSnapshot {
  const entries = [...cells.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([address, cell]) => [address, stateCell(cell)]);
  const snapshot: LedgerStateSnapshot = {
    range,
    fingerprint: JSON.stringify(entries),
  };
  if (revision !== undefined) snapshot.revision = revision;
  return snapshot;
}

export function assertLedgerStateFresh(
  expected: LedgerStateSnapshot,
  actual: LedgerStateSnapshot,
): void {
  if (expected.range !== actual.range || expected.fingerprint !== actual.fingerprint) {
    throw new StaleWriteConflictError(expected, actual);
  }
}

function stateCell(cell: FeishuCell): Record<string, unknown> {
  return {
    value: cell.value,
    formula: cell.formula,
    value_type: cell.value_type,
    data_type: cell.data_type,
    cell_styles: cell.cell_styles,
    style: cell.style,
    data_validation: cell.data_validation,
  };
}
