import { isLedgerAction, isStockCondition, type LedgerAction, type StockCondition } from '../config/controlledValues.js';

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

export function normalizeDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  let date: Date;
  if (value instanceof Date) {
    date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  } else if (typeof value === 'string') {
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
    if (!match) throw new TypeError('date must be YYYY-MM-DD or YYYY/M/D');
    date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
      throw new TypeError('date is invalid');
    }
  } else {
    throw new TypeError('date must be a Date or date text');
  }
  if (Number.isNaN(date.getTime())) throw new TypeError('date is invalid');
  return date;
}

export function toFeishuDateSerial(date: Date): number {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86_400_000);
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
