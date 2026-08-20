import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocationSummary, summarizeLocations } from '../src/application/locationSummary.js';

test('location summary renders empty location', () => {
  assert.equal(formatLocationSummary('R2-4-5-L'), 'R2-4-5-L\n空');
});

test('single SKU is visible with total', () => {
  const result = summarizeLocations([{ location: 'R2-4-5-L', sku: '97-A', qty: 3 }]);
  assert.equal(formatLocationSummary('R2-4-5-L', result.summaries[0]), 'R2-4-5-L\n97-A × 3\n总数: 3');
});

test('multiple SKUs stay visible and deterministically sorted', () => {
  const result = summarizeLocations([
    { location: 'R2-4-5-L', sku: '97-B', qty: 2 },
    { location: 'R2-4-5-L', sku: '97-A', qty: 3 },
  ]);
  assert.equal(formatLocationSummary('R2-4-5-L', result.summaries[0]), 'R2-4-5-L\n97-A × 3\n97-B × 2\n总数: 5');
});

test('one container is displayed', () => {
  const result = summarizeLocations([{ location: 'R2-4-5-L', sku: '97-A', qty: 3, container: 'Mix001' }]);
  assert.equal(formatLocationSummary('R2-4-5-L', result.summaries[0]), 'R2-4-5-L\n97-A × 3\n容器: Mix001\n总数: 3');
});

test('mixed containers are deterministic', () => {
  const result = summarizeLocations([
    { location: 'R2-4-5-L', sku: '97-A', qty: 1, container: 'Mix002' },
    { location: 'R2-4-5-L', sku: '97-B', qty: 1, container: 'Mix001' },
  ]);
  assert.deepEqual(result.summaries[0]?.containers, ['Mix001', 'Mix002']);
});

test('zero-available records are excluded', () => {
  assert.deepEqual(summarizeLocations([{ location: 'R1', sku: 'SKU', qty: 0 }]).summaries, []);
});

test('malformed and missing quantities are excluded and reported', () => {
  const result = summarizeLocations([
    { location: 'R1', sku: 'SKU1', qty: 'many', sourceRow: 10 },
    { location: 'R1', sku: 'SKU2', qty: '', sourceRow: 11 },
  ]);
  assert.deepEqual(result.summaries, []);
  assert.deepEqual(result.issues.map((item) => item.code), ['INVALID_INVENTORY_QTY', 'MISSING_INVENTORY_QTY']);
});

test('same SKU across rows aggregates correctly', () => {
  const result = summarizeLocations([
    { location: 'R1', sku: 'SKU', qty: 2 }, { location: 'R1', sku: 'SKU', qty: 3 },
  ]);
  assert.deepEqual(result.summaries[0]?.skuLines, [{ sku: 'SKU', qty: 5 }]);
  assert.equal(result.summaries[0]?.totalQty, 5);
});
