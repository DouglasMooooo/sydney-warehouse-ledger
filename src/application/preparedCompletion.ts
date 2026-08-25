import { normalizeLocation, normalizeSN } from '../ledger/normalize.js';

export interface PreparedCompletionInput {
  expectedQty: number;
  snText: string;
  confirmedLocation: string;
  locationConfirmed: boolean;
  pickupCode?: string | undefined;
}

export interface PreparedCompletionState {
  ready: boolean;
  sns: string[];
  location?: string;
  blockers: string[];
}

export function evaluatePreparedCompletion(input: PreparedCompletionInput): PreparedCompletionState {
  const blockers: string[] = [];
  const sns = input.snText.split(/[\r\n,，;；\s]+/).map((value) => normalizeSN(value)).filter((value): value is string => Boolean(value));
  const location = normalizeLocation(input.confirmedLocation);
  if (!input.pickupCode) blockers.push('取件码尚未自动生成');
  if (!Number.isInteger(input.expectedQty) || input.expectedQty < 1) blockers.push('工单数量无效');
  if (sns.length !== input.expectedQty) blockers.push(`需要人工填写 ${input.expectedQty} 个 SN`);
  if (new Set(sns).size !== sns.length) blockers.push('SN 不能重复');
  if (!location) blockers.push('必须人工填写最终库位');
  if (!input.locationConfirmed) blockers.push('必须勾选现场库位确认');
  return { ready: blockers.length === 0, sns, blockers, ...(location ? { location } : {}) };
}
