export interface FeishuCell {
  value?: unknown;
  formula?: string;
  value_type?: string;
  data_type?: string;
  data_validation?: unknown;
  cell_styles?: { number_format?: string };
}

export interface FeishuRange {
  range: string;
  actual_range: string;
  cells: FeishuCell[][];
  row_indices: number[];
  col_indices: string[];
  truncated: boolean;
}

export interface CellsGetData {
  has_more: boolean;
  ranges: FeishuRange[];
  warning_message?: string;
  revision?: number;
}

export interface LarkEnvelope<T> {
  ok: boolean;
  identity?: string;
  data: T;
  error?: { message?: string };
}

export interface ProposedChange {
  sheet: string;
  cell: string;
  old?: unknown;
  oldFormula?: string;
  newValue?: unknown;
  newFormula?: string;
  reason: string;
}

export interface ExplicitWriteRequest {
  spreadsheetUrl: string;
  sheetId: string;
  sheetName: string;
  purpose: 'BUSINESS_RECORD' | 'FORMULA_REPAIR';
  changes: ProposedChange[];
  dryRun: boolean;
}
