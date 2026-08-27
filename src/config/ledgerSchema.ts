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

/** Header guard for the operational ledger. The position mapping is centralized
 * here so a changed Feishu sheet cannot silently receive data in a wrong column. */
export const MAIN_LEDGER_FIELDS = {
  A: ['日期', 'Date'], B: ['实际出库日', 'Actual Outbound Date'], C: ['动作', 'Action'],
  D: ['ERP SH单号', 'SH单号', 'SH No'], E: ['取货码', 'Pickup Code'], F: ['容器码', 'Container Code'],
  G: ['料号', 'SKU'], J: ['机器唯一码（SN）', '机器唯一码', 'SN'], K: ['数量', 'Qty'],
  L: ['来源库位', 'From Location'], M: ['目标库位', 'To Location'], N: ['ERP仓库选择', 'ERP仓库', 'ERP Warehouse'],
  P: ['库存属性', 'Stock Condition'], V: ['备注', 'Remark'],
} as const satisfies Partial<Record<BusinessColumn, readonly string[]>>;

export function assertMainLedgerSchema(headers: readonly string[]): void {
  for (const [column, accepted] of Object.entries(MAIN_LEDGER_FIELDS)) {
    const index = columnToIndex(column);
    const actual = String(headers[index] ?? '').trim();
    if (!accepted.some((candidate) => candidate === actual)) {
      throw new Error(`OPERATIONAL_LEDGER_SCHEMA_MISMATCH:${column}`);
    }
  }
  for (const column of PROTECTED_COLUMNS) {
    if (!String(headers[columnToIndex(column)] ?? '').trim()) {
      throw new Error(`OPERATIONAL_LEDGER_SCHEMA_MISMATCH:${column}`);
    }
  }
}

function columnToIndex(column: string): number {
  let result = 0;
  for (const character of column) result = result * 26 + character.charCodeAt(0) - 64;
  return result - 1;
}
