export const WORK_ORDER_SECTION = {
  REPLACEMENT_UNIT: 'REPLACEMENT_UNIT',
  FAULTY_UNIT: 'FAULTY_UNIT',
  OTHER: 'OTHER',
} as const;

export type WorkOrderSection = (typeof WORK_ORDER_SECTION)[keyof typeof WORK_ORDER_SECTION];

const replacementHeading = 'replacement unit information';
const faultyHeading = 'faulty unit information';

/** Identifies section headings after whitespace, case, and English/Chinese colon normalization. */
export function identifySectionHeading(value: unknown): WorkOrderSection | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeSectionHeading(value);
  if (!normalized) return undefined;
  if (normalized === replacementHeading) return WORK_ORDER_SECTION.REPLACEMENT_UNIT;
  if (normalized === faultyHeading) return WORK_ORDER_SECTION.FAULTY_UNIT;
  if (/^[\p{L}\p{N}][\p{L}\p{N}\s/&()_-]*\s+information$/u.test(normalized)) {
    return WORK_ORDER_SECTION.OTHER;
  }
  return undefined;
}

export function normalizeSectionHeading(value: string): string {
  return value.trim().replace(/[:：]\s*$/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}
