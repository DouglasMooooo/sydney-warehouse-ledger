import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectUatRuntimeConfig, RuntimeConfigError, validateUatRuntimeConfig } from '../src/config/runtimeConfig.js';
import { getDeploymentMode, getFeatureFlags } from '../src/config/featureFlags.js';

const valid = {
  FEISHU_READ_ADAPTER: 'openapi', FEISHU_APP_ID: 'app', FEISHU_APP_SECRET: 'secret', FEISHU_SPREADSHEET_TOKEN: 'sheet',
  FEISHU_MAIN_SHEET_ID: 'main', FEISHU_CURRENT_INVENTORY_SHEET_ID: 'inventory', FEISHU_OAUTH_REDIRECT_URI: 'https://uat.example.test/api/auth/feishu/callback',
  WAREHOUSE_SESSION_SECRET: 'x'.repeat(32), WAREHOUSE_ADMIN_USERS: 'admin', WAREHOUSE_OPERATOR_USERS: 'operator', WAREHOUSE_READ_ONLY_USERS: 'reader',
  READ_ONLY_RELEASE: 'true', APP_VERSION: 'commit-sha',
  CURRENT_INVENTORY_AUTHORITY_MODE: 'EXPLICIT_BASELINE', CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE: '2026-08-26',
};

test('UAT runtime config accepts only complete HTTPS OpenAPI read-only configuration', () => {
  assert.deepEqual(validateUatRuntimeConfig(valid), { mode: 'READ_ONLY_UAT', version: 'commit-sha', oauthRedirectUri: 'https://uat.example.test/api/auth/feishu/callback' });
  assert.deepEqual(inspectUatRuntimeConfig(valid), { readOnlyRelease: true, authConfigured: true, openApiConfigured: true, rolesConfigured: true, versionConfigured: true, currentInventoryAuthorityConfigured: true });
});

test('UAT runtime config accepts explicit controlled write mode only with read-only disabled', () => {
  const writable = { ...valid, READ_ONLY_RELEASE: 'false', CONTROLLED_WRITE_UAT: 'true' };
  assert.equal(validateUatRuntimeConfig(writable).mode, 'CONTROLLED_WRITE_UAT');
  assert.throws(() => validateUatRuntimeConfig({ ...writable, CONTROLLED_WRITE_UAT: 'false' }), RuntimeConfigError);
});

test('UAT roles require operator and read-only users but allow an explicitly empty admin list', () => {
  const noAdmin = { ...valid, WAREHOUSE_ADMIN_USERS: '' };
  assert.equal(inspectUatRuntimeConfig(noAdmin).rolesConfigured, true);
  assert.doesNotThrow(() => validateUatRuntimeConfig(noAdmin));
  assert.equal(inspectUatRuntimeConfig({ ...noAdmin, WAREHOUSE_OPERATOR_USERS: '' }).rolesConfigured, false);
  assert.equal(inspectUatRuntimeConfig({ ...noAdmin, WAREHOUSE_READ_ONLY_USERS: '' }).rolesConfigured, false);
  const missingAdminKey = { ...valid };
  delete (missingAdminKey as Partial<typeof valid>).WAREHOUSE_ADMIN_USERS;
  assert.throws(() => validateUatRuntimeConfig(missingAdminKey), (error: unknown) => {
    assert(error instanceof RuntimeConfigError);
    assert(error.missingOrInvalid.includes('WAREHOUSE_ADMIN_USERS(config-key)'));
    return true;
  });
});

test('runtime config fails closed without read-only flag and never includes secret values', () => {
  const unsafe = { ...valid, READ_ONLY_RELEASE: '', FEISHU_APP_SECRET: 'do-not-leak', WAREHOUSE_SESSION_SECRET: 'short' };
  assert.throws(() => validateUatRuntimeConfig(unsafe), (error: unknown) => {
    assert(error instanceof RuntimeConfigError);
    assert(!error.message.includes('do-not-leak'));
    assert(!error.message.includes('short'));
    assert(error.missingOrInvalid.includes('READ_ONLY_RELEASE=true or CONTROLLED_WRITE_UAT=true'));
    return true;
  });
});

test('Feishu UAT feature policy enables normal operations but keeps migration and authoritative APIs disabled',()=>{const flags=getFeatureFlags({...valid,DEPLOYMENT_MODE:'FEISHU_UAT'});assert.equal(getDeploymentMode({DEPLOYMENT_MODE:'FEISHU_UAT'}),'FEISHU_UAT');assert.equal(flags.warehouseOperations,true);assert.equal(flags.aiReadQueries,true);assert.equal(flags.migrationStatusRead,true);assert.equal(flags.migrationBulkApproval,false);assert.equal(flags.migrationPersistence,false);assert.equal(flags.authoritativeSnApi,false);assert.equal(flags.movementRegistryWrite,false);});
