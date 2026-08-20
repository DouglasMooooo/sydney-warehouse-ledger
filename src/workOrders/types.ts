export type WorkOrderParseConfidence = 'high' | 'needs_confirmation';

export interface ParsedReplacementLine {
  sku: string;
  qty: number;
  erpWarehouse: string;
  sourceRow?: number;
}

export interface ParsedWorkOrder {
  shNo?: string;
  replacementLines: ParsedReplacementLine[];
  sourceFileName?: string;
  confidence: WorkOrderParseConfidence;
  warnings: string[];
}

export interface TextWorkOrderSource {
  sourceText: string;
  sourceFileName?: string;
}
