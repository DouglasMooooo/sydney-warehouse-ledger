import type { FeishuCell } from '../feishu/types.js';

export type QualityCode =
  | 'DATE_STORED_AS_TEXT' | 'HIDDEN_CHARACTER' | 'INVALID_ACTION' | 'INVALID_STOCK_CONDITION'
  | 'INVALID_LOCATION' | 'INVALID_QTY' | 'MISSING_SKU' | 'MISSING_SN'
  | 'PREPARED_WITHOUT_SOURCE_LOCATION' | 'PREPARED_WITHOUT_PICKUP_CODE'
  | 'PRODUCT_OUTBOUND_WITHOUT_SN' | 'RETURN_WITHOUT_TARGET_LOCATION'
  | 'MOVE_WITHOUT_SOURCE' | 'MOVE_WITHOUT_TARGET' | 'FORMULA_MISSING'
  | 'FORMULA_BROKEN' | 'VALIDATION_NOT_OK';

export interface LedgerScanRow {
  row: number;
  cells: Record<string, FeishuCell>;
}

export interface QualityIssue {
  severity: 'ERROR' | 'WARNING';
  code: QualityCode;
  sheet: '主表 库存流水';
  row: number;
  column: string;
  evidence: string;
  suggestedAction: string;
}

export interface QualityReport {
  generatedAt: string;
  sheet: string;
  scannedRows: number;
  counts: Record<QualityCode, number>;
  affectedRows: Partial<Record<QualityCode, number[]>>;
  issues: QualityIssue[];
}
