import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGoogleSheetsUatMode, isVisualDemoMode, visualDemoDashboard, visualDemoExceptions, visualDemoLocations, visualDemoTasks,
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

test('Google Sheets UAT requires the public reader, release flag, source id, and version', () => {
  const env = {
    WAREHOUSE_GOOGLE_UAT: 'true', READ_ONLY_RELEASE: 'true', WAREHOUSE_READ_ADAPTER: 'google-sheets-gviz',
    GOOGLE_SPREADSHEET_ID: 'public-sheet', APP_VERSION: 'uat',
  };
  assert.equal(isGoogleSheetsUatMode(env), true);
  assert.equal(isGoogleSheetsUatMode({ ...env, READ_ONLY_RELEASE: 'false' }), false);
  assert.equal(isGoogleSheetsUatMode({ ...env, GOOGLE_SPREADSHEET_ID: '' }), false);
  assert.equal(isGoogleSheetsUatMode({ ...env, WAREHOUSE_SESSION_SECRET: 'live' }), false);
});
