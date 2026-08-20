export const BUSINESS_COLUMNS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'N', 'P', 'V',
] as const;

export const PROTECTED_COLUMNS = [
  'H', 'I', 'O', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC',
] as const;

export type BusinessColumn = (typeof BUSINESS_COLUMNS)[number];
export type ProtectedColumn = (typeof PROTECTED_COLUMNS)[number];
export type LedgerColumn = BusinessColumn | ProtectedColumn;
export type WritePurpose = 'BUSINESS_RECORD' | 'FORMULA_REPAIR';

const businessSet = new Set<string>(BUSINESS_COLUMNS);
const protectedSet = new Set<string>(PROTECTED_COLUMNS);

export function isBusinessColumn(column: string): column is BusinessColumn {
  return businessSet.has(column);
}

export function isProtectedColumn(column: string): column is ProtectedColumn {
  return protectedSet.has(column);
}

export function assertColumnWriteAllowed(column: string, purpose: WritePurpose): void {
  if (isProtectedColumn(column) && purpose !== 'FORMULA_REPAIR') {
    throw new Error(`Protected column ${column} requires FORMULA_REPAIR`);
  }
  if (!isBusinessColumn(column) && !isProtectedColumn(column)) {
    throw new Error(`Unknown ledger column: ${column}`);
  }
  if (purpose === 'BUSINESS_RECORD' && !isBusinessColumn(column)) {
    throw new Error(`Business write is not allowed for column ${column}`);
  }
}

export const LEDGER_COLUMNS = {
  date: 'A',
  outboundDate: 'B',
  action: 'C',
  shNo: 'D',
  pickupCode: 'E',
  containerCode: 'F',
  sku: 'G',
  sn: 'J',
  qty: 'K',
  fromLocation: 'L',
  toLocation: 'M',
  erpWarehouse: 'N',
  stockCondition: 'P',
  remark: 'V',
} as const satisfies Record<string, BusinessColumn>;
