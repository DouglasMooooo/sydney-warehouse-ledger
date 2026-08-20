import type { FeishuCell } from '../feishu/types.js';

export const STALE_WRITE_CONFLICT = 'STALE_WRITE_CONFLICT' as const;

export interface LedgerStateSnapshot {
  range: string;
  revision?: number;
  fingerprint: string;
}

export type OperationKind = 'WORK_ORDER_PREPARED' | 'RETURN_TO_REPAIR' | 'MOVE' | 'ADJUSTMENT';
export type DependencyKind = 'INVENTORY_SELECTION' | 'PICKUP_CODE_UNIQUENESS' | 'SERIAL_HISTORY' | 'CURRENT_SERIAL_STATE' | 'CURRENT_INVENTORY';

export interface OperationDependencySnapshot {
  kind: DependencyKind;
  snapshot: LedgerStateSnapshot;
}

export interface OperationPrecondition {
  operationKind: OperationKind;
  targetRow: number;
  target: LedgerStateSnapshot;
  dependencies: OperationDependencySnapshot[];
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

export function targetRowRange(targetRow: number): string {
  if (!Number.isInteger(targetRow) || targetRow < 2) throw new Error('Invalid target ledger row');
  return `A${targetRow}:AC${targetRow}`;
}

export function createOperationPrecondition(
  operationKind: OperationKind,
  targetRow: number,
  target: LedgerStateSnapshot,
  dependencies: OperationDependencySnapshot[],
): OperationPrecondition {
  const requiredTargetRange = targetRowRange(targetRow);
  if (target.range !== requiredTargetRange) {
    throw new Error(`Operation target snapshot must cover ${requiredTargetRange}`);
  }
  const kinds = new Set<DependencyKind>();
  for (const dependency of dependencies) {
    if (dependency.snapshot.range === target.range) throw new Error('Dependency cannot reuse the target-row snapshot');
    if (kinds.has(dependency.kind)) throw new Error(`Duplicate dependency ${dependency.kind}`);
    kinds.add(dependency.kind);
  }
  for (const required of requiredDependencies(operationKind)) {
    if (!kinds.has(required)) throw new Error(`${operationKind} requires ${required} precondition`);
  }
  return { operationKind, targetRow, target, dependencies };
}

export function assertOperationPreconditionFresh(
  expected: OperationPrecondition,
  actual: OperationPrecondition,
): void {
  if (expected.operationKind !== actual.operationKind || expected.targetRow !== actual.targetRow) {
    throw new StaleWriteConflictError(expected.target, actual.target);
  }
  assertLedgerStateFresh(expected.target, actual.target);
  const actualByKind = new Map(actual.dependencies.map((item) => [item.kind, item.snapshot]));
  for (const dependency of expected.dependencies) {
    const current = actualByKind.get(dependency.kind);
    if (!current) throw new StaleWriteConflictError(dependency.snapshot, actual.target);
    assertLedgerStateFresh(dependency.snapshot, current);
  }
}

function requiredDependencies(operationKind: OperationKind): DependencyKind[] {
  switch (operationKind) {
    case 'WORK_ORDER_PREPARED': return ['INVENTORY_SELECTION', 'PICKUP_CODE_UNIQUENESS'];
    case 'RETURN_TO_REPAIR': return ['SERIAL_HISTORY'];
    case 'MOVE': return ['CURRENT_SERIAL_STATE'];
    case 'ADJUSTMENT': return ['CURRENT_INVENTORY'];
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
