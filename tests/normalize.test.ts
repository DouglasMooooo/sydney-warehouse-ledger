import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDate, normalizePickupCode, normalizeQty, normalizeRemark, normalizeSH, normalizeSKU, toFeishuDateSerial } from '../src/ledger/normalize.js';

test('real date input is accepted', () => assert.equal(normalizeDate(new Date(2026, 7, 20))?.toISOString(), '2026-08-20T00:00:00.000Z'));
test('text date is converted', () => assert.equal(normalizeDate('2026-08-20')?.toISOString(), '2026-08-20T00:00:00.000Z'));
test('invalid date is rejected', () => assert.throws(() => normalizeDate('2026-02-30')));
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
  assert.equal(toFeishuDateSerial(normalizeDate('2026-08-20')!), 46254);
});
