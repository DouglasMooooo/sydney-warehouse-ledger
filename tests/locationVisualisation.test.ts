import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRackPositions, parseRackLocation } from '../src/application/locationVisualisation.js';

test('R1-2-3-L decodes to rack 1, row 2, bay 3, left side', () => {
  assert.deepEqual(parseRackLocation('R1-2-3-L'), {
    code: 'R1-2-3-L', rack: 1, row: 2, bay: 3, side: 'L', sideLabel: '左侧',
    description: '货架 1 · 第 2 排 · 第 3 个 Bay · 左侧',
  });
  assert.equal(parseRackLocation('REPAIR-01'), undefined);
});

test('rack locations sort by rack, row, bay, then side', () => {
  const values = ['R2-1-1-L', 'R1-2-1-R', 'R1-1-2-L', 'R1-1-1-L'].map((code) => parseRackLocation(code)!);
  values.sort(compareRackPositions);
  assert.deepEqual(values.map((value) => value.code), ['R1-1-1-L', 'R1-1-2-L', 'R1-2-1-R', 'R2-1-1-L']);
});
