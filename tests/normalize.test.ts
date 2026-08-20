import assert from 'node:assert/strict';
import test from 'node:test';
import {
  businessDateFromSydneyInstant, parseBusinessDateString, normalizePickupCode, normalizeQty,
  normalizeRemark, normalizeSH, normalizeSKU, toFeishuDateSerial,
} from '../src/ledger/normalize.js';

test('business date text is canonicalized', () => {
  assert.equal(parseBusinessDateString('2026-08-20'), '2026-08-20');
  assert.equal(parseBusinessDateString('2026/8/20'), '2026-08-20');
});
test('invalid date is rejected', () => assert.throws(() => parseBusinessDateString('2026-02-30')));
test('timestamps and JavaScript Date inputs are rejected by normal ledger input', () => {
  assert.throws(() => parseBusinessDateString('2026-08-20T00:00:00+10:00'));
  assert.throws(() => parseBusinessDateString(new Date('2026-08-20T00:00:00+10:00')));
});
test('SH removes boundary whitespace and newline', () => assert.equal(normalizeSH('  SH001\n'), 'SH001'));
test('SKU remains text and keeps leading zero', () => assert.equal(normalizeSKU('00123'), '00123'));
test('identifier removes CR/LF/TAB and invisible characters', () => {
  assert.equal(normalizeSKU(' 00\u200B1\r\n\t'), '001');
});
test('Pickup Code accepts controlled format', () => assert.equal(normalizePickupCode('SYD-00315'), 'SYD-00315'));
test('Pickup Code rejects invalid format', () => assert.throws(() => normalizePickupCode('SYD-315')));
test('Qty accepts number and numeric string', () => { assert.equal(normalizeQty(1), 1); assert.equal(normalizeQty('2'), 2); });
test('Qty rejects invalid text', () => assert.throws(() => normalizeQty('two')));
test('Remark preserves meaningful internal newlines and tabs', () => {
  assert.equal(normalizeRemark('  first line\nsecond\tvalue  '), 'first line\nsecond\tvalue');
});
test('Remark is text-only and does not use identifier coercion', () => assert.throws(() => normalizeRemark(123)));
test('date serial uses the Feishu/Excel epoch', () => {
  assert.equal(toFeishuDateSerial(parseBusinessDateString('2026-08-20')!), 46254);
});

test('BusinessDate serial is unaffected by runtime TZ setting', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const utc = toFeishuDateSerial(parseBusinessDateString('2026-08-20')!);
    process.env.TZ = 'Australia/Sydney';
    const sydney = toFeishuDateSerial(parseBusinessDateString('2026-08-20')!);
    assert.equal(utc, 46254);
    assert.equal(sydney, utc);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('Sydney instant conversion preserves midnight business date and daylight saving dates', () => {
  assert.equal(businessDateFromSydneyInstant(new Date('2026-08-19T14:00:00Z')), '2026-08-20');
  assert.equal(businessDateFromSydneyInstant(new Date('2026-01-14T13:00:00Z')), '2026-01-15');
  assert.equal(businessDateFromSydneyInstant(new Date('2026-10-03T14:00:00Z')), '2026-10-04');
});
