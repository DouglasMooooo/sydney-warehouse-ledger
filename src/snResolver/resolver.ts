import { REVISION_GATED_PREFIXES, SN_RULES } from './rules.js';
import type { SnMaterialRule, SnResolveResult, SnStatus, VerifiedSnMapping } from './types.js';

export function normalizeSn(rawSn: string): string {
  return String(rawSn ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function snStatus(normalizedSn: string): SnStatus {
  return normalizedSn[7] === '0' ? 'ORIGINAL' : normalizedSn[7] === 'R' ? 'REPAIRED_GOOD' : 'UNKNOWN';
}

export function canonicalizeSn(rawSn: string): string {
  const sn = normalizeSn(rawSn);
  return sn.length >= 8 && (sn[7] === '0' || sn[7] === 'R') ? `${sn.slice(0, 7)}*${sn.slice(8)}` : sn;
}

export function resolveSnMaterial(
  inputSn: string,
  history: readonly VerifiedSnMapping[] = [],
  rules: readonly SnMaterialRule[] = SN_RULES,
): SnResolveResult {
  const normalizedSn = normalizeSn(inputSn);
  const canonicalSn = canonicalizeSn(normalizedSn);
  const status = snStatus(normalizedSn);
  const base = { inputSn, normalizedSn, canonicalSn, snStatus: status };
  if (!normalizedSn) return review(base, 'SN is empty.');

  const exact = history.filter((item) => item.verified && normalizeSn(item.sn) === normalizedSn);
  const canonicalHistory = exact.length ? exact : history.filter((item) => item.verified && item.canonicalSn === canonicalSn);
  const uniqueHistory = uniqueMaterials(canonicalHistory);
  if (uniqueHistory.length === 1) {
    const match = canonicalHistory.find((item) => item.materialCode === uniqueHistory[0])!;
    return {
      ...base, materialCode: match.materialCode, ...(match.model ? { model: match.model } : {}),
      confidence: 'EXACT_HISTORY', matchMethod: 'EXACT_HISTORY', reason: `Matched verified ${match.source} SN mapping.`,
      requiresManualReview: false,
    };
  }
  if (uniqueHistory.length > 1) return review(base, 'Verified history contains conflicting material codes.');

  const active = rules.filter((rule) => rule.active);
  const revisionRules = active.filter((rule) => rule.revisions && canonicalSn.startsWith(rule.pattern));
  if (revisionRules.length) {
    const revisionCode = canonicalSn.slice(8, 10);
    const rule = revisionRules.find((item) => item.revisions?.includes(revisionCode));
    if (!rule) return review(base, `Revision ${revisionCode || 'UNKNOWN'} is not on the verified whitelist.`);
    return ruleResult(base, rule, 'PREFIX_REVISION_RULE', `Matched verified revision ${revisionCode} whitelist.`);
  }
  if (REVISION_GATED_PREFIXES.some((prefix) => canonicalSn.startsWith(prefix))) {
    return review(base, `Revision ${canonicalSn.slice(8, 10) || 'UNKNOWN'} is not on the verified whitelist.`);
  }

  const familyRules = active.filter((rule) => !rule.revisions && canonicalSn.startsWith(rule.pattern));
  if (familyRules.length !== 1) {
    return review(base, familyRules.length > 1 ? 'More than one active family rule matched.' : 'No verified exact, revision, or family rule matched.');
  }
  return ruleResult(base, familyRules[0]!, 'FAMILY_RULE', `Matched stable ${familyRules[0]!.family} SN family.`);
}

function ruleResult(
  base: Pick<SnResolveResult, 'inputSn' | 'normalizedSn' | 'canonicalSn' | 'snStatus'>,
  rule: SnMaterialRule,
  matchMethod: 'PREFIX_REVISION_RULE' | 'FAMILY_RULE',
  reason: string,
): SnResolveResult {
  return {
    ...base, family: rule.family, materialCode: rule.materialCode, model: rule.model,
    confidence: rule.confidence === 'HIGH' ? 'HIGH' : 'EXACT_RULE', matchMethod, matchedRuleId: rule.id,
    reason, requiresManualReview: false,
  };
}

function review(base: Pick<SnResolveResult, 'inputSn' | 'normalizedSn' | 'canonicalSn' | 'snStatus'>, reason: string): SnResolveResult {
  return { ...base, confidence: 'REVIEW_REQUIRED', matchMethod: 'NONE', reason, requiresManualReview: true };
}

function uniqueMaterials(mappings: readonly VerifiedSnMapping[]): string[] {
  return [...new Set(mappings.map((item) => item.materialCode).filter(Boolean))];
}
