import { STOCK_CONDITIONS, type StockCondition } from '../../config/controlledValues.js';

/** Comparison-only normalization. It intentionally has no business alias guesses. */
export function normalizeLocation(value:string|undefined):string|undefined{
  const normalized=value?.trim().toUpperCase().replace(/\s+/g,' ');
  return normalized||undefined;
}

export function normalizeSku(value:string|undefined):string|undefined{
  const normalized=value?.trim().toUpperCase();
  return normalized||undefined;
}

export function normalizeStockCondition(value:string|undefined):StockCondition|undefined{
  const normalized=value?.trim();
  return STOCK_CONDITIONS.includes(normalized as StockCondition)?normalized as StockCondition:undefined;
}
