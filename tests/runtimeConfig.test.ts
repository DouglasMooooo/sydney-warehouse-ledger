import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectUatRuntimeConfig, RuntimeConfigError, validateUatRuntimeConfig } from '../src/config/runtimeConfig.js';

const valid = {
  FEISHU_READ_ADAPTER: 'openapi', FEISHU_APP_ID: 'app', FEISHU_APP_SECRET: 'secret', FEISHU_SPREADSHEET_TOKEN: 'sheet',
  FEISHU_MAIN_SHEET_ID: 'main', FEISHU_CURRENT_INVENTORY_SHEET_ID: 'inventory', FEISHU_OAUTH_REDIRECT_URI: 'https://uat.example.test/api/auth/feishu/callback',
  WAREHOUSE_SESSION_SECRET: 'x'.repeat(32), WAREHOUSE_ADMIN_USERS: 'admin', WAREHOUSE_OPERATOR_USERS: 'operator', WAREHOUSE_READ_ONLY_USERS: 'reader',
  READ_ONLY_RELEASE: 'true', APP_VERSION: 'commit-sha',
};

test('UAT runtime config accepts only complete HTTPS OpenAPI read-only configuration', () => {
  assert.deepEqual(validateUatRuntimeConfig(valid), { mode: 'READ_ONLY_UAT', version: 'commit-sha', oauthRedirectUri: 'https://uat.example.test/api/auth/feishu/callback' });
  assert.deepEqual(inspectUatRuntimeConfig(valid), { readOnlyRelease: true, authConfigured: true, openApiConfigured: true, rolesConfigured: true, versionConfigured: true });
});

test('runtime config fails closed without read-only flag and never includes secret values', () => {
  const unsafe = { ...valid, READ_ONLY_RELEASE: '', FEISHU_APP_SECRET: 'do-not-leak', WAREHOUSE_SESSION_SECRET: 'short' };
  assert.throws(() => validateUatRuntimeConfig(unsafe), (error: unknown) => {
    assert(error instanceof RuntimeConfigError);
    assert(!error.message.includes('do-not-leak'));
    assert(!error.message.includes('short'));
    assert(error.missingOrInvalid.includes('READ_ONLY_RELEASE=true'));
    return true;
  });
});
