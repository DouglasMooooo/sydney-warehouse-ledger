import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('every operational confirmation requires a preview command ID and preserves the authenticated operator', () => {
  for (const route of [
    'app/api/warehouse/operations/execute/route.ts',
    'app/api/warehouse/operations/batch/execute/route.ts',
    'app/api/warehouse/work-orders/confirm/route.ts',
    'app/api/warehouse/outbound/batch/route.ts',
    'app/api/warehouse/outbound/reversal/route.ts',
  ]) {
    const source = readFileSync(route, 'utf8');
    assert(source.includes('MISSING_COMMAND_ID'), `${route} must reject a confirm without commandId`);
    assert(/createdBy:\s*auth\.user\.userId/.test(source), `${route} must take createdBy from authenticated identity`);
  }
});

test('Feishu operational writes have one writer gateway and use the process-local mutex', () => {
  const writer = readFileSync('src/feishu/openApiLedgerWriter.ts', 'utf8');
  assert(writer.includes('operationalLedgerWriteMutex.runExclusive'));
  assert(writer.includes('values_batch_update'));
  for (const route of [
    'app/api/warehouse/operations/execute/route.ts',
    'app/api/warehouse/operations/batch/execute/route.ts',
    'app/api/warehouse/work-orders/confirm/route.ts',
    'app/api/warehouse/outbound/batch/route.ts',
    'app/api/warehouse/outbound/reversal/route.ts',
  ]) assert(!readFileSync(route, 'utf8').includes('values_batch_update'));
});

test('deployment blueprint is a single FEISHU_UAT instance and secrets remain host-managed', () => {
  const render = readFileSync('render.yaml', 'utf8');
  assert(/numInstances:\s*1/.test(render));
  assert(/key: DEPLOYMENT_MODE\r?\n\s+value: FEISHU_UAT/.test(render));
  for (const secret of ['FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'WAREHOUSE_SESSION_SECRET']) {
    const block = render.slice(render.indexOf(`key: ${secret}`), render.indexOf(`key: ${secret}`) + 100);
    assert(secret === 'WAREHOUSE_SESSION_SECRET' ? block.includes('generateValue: true') : block.includes('sync: false'));
  }
});
