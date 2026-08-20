declare const businessDateBrand: unique symbol;

/** A validated calendar date with no time, timezone, or offset. */
export type BusinessDate = string & { readonly [businessDateBrand]: true };

const businessDatePattern = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/;
const feishuEpochUtc = Date.UTC(1899, 11, 30);
const dayMilliseconds = 86_400_000;

export function normalizeBusinessDate(value: unknown): BusinessDate | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new TypeError('business date must be YYYY-MM-DD text');
  const match = businessDatePattern.exec(value.trim());
  if (!match) throw new TypeError('business date must be YYYY-MM-DD or YYYY/M/D');
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  assertCalendarDate(year, month, day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as BusinessDate;
}

/** Convert an instant to the Sydney warehouse calendar date explicitly. */
export function businessDateFromSydneyDate(value: Date): BusinessDate {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError('date instant is invalid');
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const normalized = normalizeBusinessDate(`${part('year')}-${part('month')}-${part('day')}`);
  if (!normalized) throw new TypeError('unable to derive Sydney business date');
  return normalized;
}

export function todayInSydney(now = new Date()): BusinessDate {
  return businessDateFromSydneyDate(now);
}

export function toFeishuDateSerial(date: BusinessDate): number {
  const { year, month, day } = businessDateParts(date);
  return Math.floor((Date.UTC(year, month - 1, day) - feishuEpochUtc) / dayMilliseconds);
}

export function businessDateParts(date: BusinessDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new TypeError('invalid BusinessDate');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  assertCalendarDate(year, month, day);
  return { year, month, day };
}

function assertCalendarDate(year: number, month: number, day: number): void {
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) throw new TypeError('business date is invalid');
}
