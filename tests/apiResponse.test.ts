import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary,
} from '../src/application/apiResponse.js';

test('API success and failure use the standard envelope', () => {
  assert.deepEqual(apiSuccess({ value: 1 }), { ok: true, data: { value: 1 } });
  assert.deepEqual(apiFailure('INVALID_DATA', 'Bad input', 'qty'), {
    ok: false, error: { code: 'INVALID_DATA', message: 'Bad input', field: 'qty' },
  });
});

test('client error sanitisation never returns stack or raw technical message', () => {
  const error = new TypeError('internal path C:\\secret\\file.ts token=abc123');
  const safe = clientSafeError(error);
  assert.deepEqual(safe, { code: 'INVALID_REQUEST', message: '请求数据格式无效。' });
  assert(!JSON.stringify(safe).includes('abc123'));
  assert(!JSON.stringify(safe).includes('file.ts'));
});

test('server error summary is bounded and redacts credential-shaped content', () => {
  const summary = serverSafeErrorSummary(new Error(
    `token=abc123 secret:xyz Authorization: Bearer bearer-value tenant_access_token=tenant-value ${'x'.repeat(700)}`,
  ));
  assert(!summary.message.includes('abc123'));
  assert(!summary.message.includes('xyz'));
  assert(!summary.message.includes('bearer-value'));
  assert(!summary.message.includes('tenant-value'));
  assert(summary.message.includes('[REDACTED]'));
  assert(summary.message.length <= 500);
});
