import { isLedgerAction, isStockCondition, type LedgerAction, type StockCondition } from '../config/controlledValues.js';
export {
  businessDateFromSydneyDate, normalizeBusinessDate, todayInSydney, toFeishuDateSerial,
  type BusinessDate,
} from './businessDate.js';

const forbiddenCharacters = /[\r\n\t\u200B-\u200D\u2060\uFEFF]/g;

export function normalizeIdentifier(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${field} must be text-compatible`);
  }
  const normalized = String(value).replace(forbiddenCharacters, '').trim();
  return normalized || undefined;
}

export const normalizeSH = (value: unknown) => normalizeIdentifier(value, 'shNo');
export const normalizeSN = (value: unknown) => normalizeIdentifier(value, 'sn');
export const normalizeSKU = (value: unknown) => normalizeIdentifier(value, 'sku');
export const normalizeLocation = (value: unknown) => normalizeIdentifier(value, 'location');
export const normalizeContainer = (value: unknown) => normalizeIdentifier(value, 'container');

export function normalizeRemark(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new TypeError('remark must be text');
  const normalized = value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  return normalized || undefined;
}

export function normalizePickupCode(value: unknown): string | undefined {
  const normalized = normalizeIdentifier(value, 'pickupCode');
  if (normalized !== undefined && !/^SYD-\d{5}$/.test(normalized)) {
    throw new TypeError('pickupCode must match SYD-00000');
  }
  return normalized;
}

export function normalizeQty(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(normalized)) throw new TypeError('qty must be numeric');
  return normalized;
}

export function normalizeAction(value: unknown): LedgerAction | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = normalizeIdentifier(value, 'action');
  if (!isLedgerAction(normalized)) throw new TypeError('action is not controlled');
  return normalized;
}

export function normalizeStockCondition(value: unknown): StockCondition | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = normalizeIdentifier(value, 'stockCondition');
  if (!isStockCondition(normalized)) throw new TypeError('stockCondition is not controlled');
  return normalized;
}
