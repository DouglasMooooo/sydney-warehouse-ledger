import type { SnMaterialRule } from './types.js';

const family = (id: string, familyName: string, materialCode: string, model: string, confidence: 'EXACT' | 'HIGH' = 'EXACT', notes?: string): SnMaterialRule => ({
  id, family: familyName, pattern: `60${id}*`, materialCode, model, confidence, active: true,
  source: 'Sydney warehouse verified SN rules', ...(notes ? { notes } : {}),
});

const revision = (id: string, familyName: string, materialCode: string, model: string, revisions: readonly string[]): SnMaterialRule => ({
  id: `${id}-${revisions.join('-')}`, family: familyName, pattern: `60${id}*`, materialCode, model,
  confidence: 'EXACT', active: true, revisions, source: 'Sydney warehouse verified revision whitelist',
});

export const SN_RULES: readonly SnMaterialRule[] = [
  family('HD103', 'H3', '97-141-00060-B0', 'H3-10.0-Smart'),
  family('HD153', 'H3', '97-141-00062-B0', 'H3-15.0-Smart'),
  family('HD992', 'H3', '97-141-00059-B0', 'H3-9.9-Smart'),
  family('HD802', 'H3', '97-141-00058-B0', 'H3-8.0-Smart'),
  family('KB103', 'KH', '30-138-K1415-B0', 'KH10'),
  family('KB992', 'KH', '30-138-K1615-B0', 'KH9.9'),
  family('KB802', 'KH', '30-138-K1215-B0', 'KH8'),
  family('HG502', 'H1 G2', '30-132-50225-B0', 'H1-5.0-E-G2', 'HIGH', 'Known legacy SKU exists; only the confirmed current 0/R family is accepted.'),
  family('HG602', 'H1 G2', '30-132-60225-B0', 'H1-6.0-E-G2'),
  family('CQ00F', 'CQ', '97-229-00012-00', 'CQ6-M'),
  family('CQ00P', 'CQ', '97-229-00020-00', 'CQ6-M'),
  family('CQ00Q', 'CQ', '97-229-00021-00', 'CQ6-S'),
  family('CQ00L', 'CQ', '97-229-00018-00', 'CQ6-S'),
  family('CQ00N', 'CQ', '97-229-00015-00', 'CQ6-S'),
  family('CQ00G', 'CQ', '97-229-00014-00', 'CQ6-S'),
  family('CQ011', 'CQ', '30-229-00003-00', 'CQ6-S'),
  family('CQ022', 'CQ', '30-229-00024-00', 'CQ7-M'),
  family('E1S48', 'EQ4800-S', '97-223-00107-00', 'EQ4800-S'),
  family('E2S48', 'EQ4800-S', '97-223-00105-00', 'EQ4800-S'),
  family('E3S48', 'EQ4800-S', '30-223-00002-00', 'EQ4800-S'),
  family('E4S48', 'EQ4800-S', '97-223-00067-00', 'EQ4800-S'),
  family('E5S48', 'EQ4800-S', '97-223-00065-00', 'EQ4800-S', 'HIGH', 'Revision extension point retained.'),
  family('E1M48', 'EQ4800-M', '97-223-00108-00', 'EQ4800-M'),
  revision('E3M48', 'EQ4800-M', '30-223-00001-00', 'EQ4800-M', ['52', '54']),
  revision('E3M48', 'EQ4800-M', '97-223-00090-00', 'EQ4800-M', ['5C', '61', '62', '63', '64']),
  revision('E4M48', 'EQ4800-M', '97-223-00066-00', 'EQ4800-M', ['57', '58']),
  revision('E4M48', 'EQ4800-M', '97-223-00089-00', 'EQ4800-M', ['5B', '5C']),
  revision('E5M48', 'EQ4800-M', '97-223-00064-00', 'EQ4800-M', ['57', '58', '59', '5A']),
  revision('E5M48', 'EQ4800-M', '97-223-00088-00', 'EQ4800-M', ['5B', '5C', '61', '62', '63', '64']),
  family('EP811', 'EP11', '97-224-00034-00', 'EP11-502D'),
  family('EP011', 'EP11', '30-224-00002-00', 'EP11-502D'),
];

export const REVISION_GATED_PREFIXES = ['60E3M48*', '60E4M48*', '60E5M48*'] as const;

