import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVisualDemoMode, visualDemoDashboard, visualDemoExceptions, visualDemoLocations, visualDemoTasks,
} from '../src/demo/visualDemo.js';
import { parseBusinessDateString } from '../src/ledger/businessDate.js';

test('visual demo requires explicit read-only mode and no live credentials', () => {
  assert.equal(isVisualDemoMode({ WAREHOUSE_VISUAL_DEMO: 'true', READ_ONLY_RELEASE: 'true' }), true);
  assert.equal(isVisualDemoMode({ WAREHOUSE_VISUAL_DEMO: 'true' }), false);
  assert.equal(isVisualDemoMode({ WAREHOUSE_VISUAL_DEMO: 'true', READ_ONLY_RELEASE: 'true', FEISHU_APP_ID: 'live' }), false);
  assert.equal(isVisualDemoMode({ WAREHOUSE_VISUAL_DEMO: 'false', READ_ONLY_RELEASE: 'true' }), false);
});

test('visual demo data is clearly synthetic and covers the read-only screens', () => {
  const today = parseBusinessDateString('2026-08-21')!;
  const dashboard = visualDemoDashboard(today);
  const tasks = visualDemoTasks(today);
  const locations = visualDemoLocations();
  const exceptions = visualDemoExceptions();
  assert(dashboard.recentPrepared.every((item) => item.sku.startsWith('DEMO-')));
  assert.equal(tasks.todayPrepared.length > 0, true);
  assert.equal(locations.locations.length > 0, true);
  assert.equal(exceptions.exceptions.length > 0, true);
  assert(dashboard.notes.some((note) => note.includes('不代表真实库存')));
});
