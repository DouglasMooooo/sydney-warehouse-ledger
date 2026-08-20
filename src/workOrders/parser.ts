import type { ParsedWorkOrder } from './types.js';

export interface WorkOrderParser<TSource> {
  readonly format: 'text' | 'xlsx';
  parse(source: TSource): ParsedWorkOrder | Promise<ParsedWorkOrder>;
}

export function needsConfirmation(warnings: string[], sourceFileName?: string): ParsedWorkOrder {
  const result: ParsedWorkOrder = { replacementLines: [], confidence: 'needs_confirmation', warnings };
  if (sourceFileName) result.sourceFileName = sourceFileName;
  return result;
}
