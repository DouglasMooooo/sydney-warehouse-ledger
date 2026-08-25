import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeSn, normalizeSn, resolveSnMaterial } from '../src/snResolver/resolver.js';
import type { VerifiedSnMapping } from '../src/snResolver/types.js';

const material = (sn: string) => resolveSnMaterial(sn).materialCode;

test('normalization removes whitespace and canonicalizes only the 8th-position 0/R status bit', () => {
  assert.equal(normalizeSn(' 60hd1030 64pm133 '), '60HD103064PM133');
  assert.equal(canonicalizeSn('60HD103064PM133'), '60HD103*64PM133');
  assert.equal(canonicalizeSn('60HD103R64PM133'), '60HD103*64PM133');
  assert.equal(resolveSnMaterial('60HD103064PM133').snStatus, 'ORIGINAL');
  assert.equal(resolveSnMaterial('60HD103R64PM133').snStatus, 'REPAIRED_GOOD');
});

test('0/R encoding status does not change H3 material resolution', () => {
  assert.equal(material('60HD103064PM133'), '97-141-00060-B0');
  assert.equal(material('60HD103R64PM133'), '97-141-00060-B0');
});

test('stable family rules resolve confirmed KH, CQ, H3, EQ-S and EP variants', () => {
  assert.equal(material('60KB103061NB141'), '30-138-K1415-B0');
  assert.equal(material('60CQ00F062AAB31'), '97-229-00012-00');
  assert.equal(material('60CQ00L0623Y117'), '97-229-00018-00');
  assert.equal(material('60HD9920614M161'), '97-141-00059-B0');
  assert.equal(material('60E1S48061TJ091'), '97-223-00107-00');
  assert.equal(material('60EP811061TJ091'), '97-224-00034-00');
  assert.equal(material('60EP011061TJ091'), '30-224-00002-00');
});

test('revision-gated E3M/E4M/E5M use explicit whitelists only', () => {
  assert.equal(material('60E3M48052BG028'), '30-223-00001-00');
  assert.equal(material('60E3M48R63QF125'), '97-223-00090-00');
  assert.equal(material('60E4M48058BG028'), '97-223-00066-00');
  assert.equal(material('60E4M48R5CQF125'), '97-223-00089-00');
  assert.equal(material('60E5M48058BG028'), '97-223-00064-00');
  assert.equal(material('60E5M48R63QF125'), '97-223-00088-00');
  const unknown = resolveSnMaterial('60E5M48R65XX999');
  assert.equal(unknown.materialCode, undefined);
  assert.equal(unknown.confidence, 'REVIEW_REQUIRED');
  assert.match(unknown.reason, /not on the verified whitelist/);
});

test('resolver does not fuzzy match near or unknown families', () => {
  assert.equal(resolveSnMaterial('60KB104061NB141').confidence, 'REVIEW_REQUIRED');
  assert.equal(resolveSnMaterial('60E5M48X63QF125').confidence, 'REVIEW_REQUIRED');
});

test('verified exact history takes priority and conflicting history forces review', () => {
  const mapping: VerifiedSnMapping = {
    sn: '60HD103064PM133', canonicalSn: '60HD103*64PM133', materialCode: 'HISTORY-SKU', model: 'Verified model',
    verified: true, source: 'MANUAL_CONFIRMED', createdAt: '2026-08-25T00:00:00Z',
  };
  const exact = resolveSnMaterial('60HD103R64PM133', [mapping]);
  assert.equal(exact.materialCode, 'HISTORY-SKU');
  assert.equal(exact.confidence, 'EXACT_HISTORY');
  const conflict = resolveSnMaterial('60HD103R64PM133', [mapping, { ...mapping, materialCode: 'OTHER-SKU' }]);
  assert.equal(conflict.confidence, 'REVIEW_REQUIRED');
});

test('legacy-sensitive HG502 and revision-extensible E5S are HIGH, not guessed EXACT', () => {
  assert.equal(resolveSnMaterial('60HG50206123456').confidence, 'HIGH');
  assert.equal(resolveSnMaterial('60E5S4806123456').confidence, 'HIGH');
});

