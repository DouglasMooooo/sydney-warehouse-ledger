import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { GoogleSheetsWriteTestClient, googleWriteTestConfigFromEnv, GoogleWriteTestUnavailableError } from '../src/googleSheets/writeTest.js';

test('Google UAT write-test config fails closed without flag or credentials', () => {
  assert.throws(() => googleWriteTestConfigFromEnv({}), GoogleWriteTestUnavailableError);
  assert.throws(() => googleWriteTestConfigFromEnv({ WAREHOUSE_GOOGLE_WRITE_TEST: 'true' }), GoogleWriteTestUnavailableError);
});

test('Google UAT write-test obtains OAuth token and appends exactly one bounded row to fixed tab', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, ...(init ? { init } : {}) });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
    return new Response(JSON.stringify({ updates: { updatedRange: "'UAT_写入测试'!A2:E2", updatedRows: 1 } }), { status: 200 });
  }) as typeof fetch;
  const client = new GoogleSheetsWriteTestClient(
    { spreadsheetId: 'uat-copy-id', serviceAccountEmail: 'uat@example.test', serviceAccountPrivateKey: privateKey },
    fetchImpl,
    () => new Date('2026-08-21T01:02:03.000Z'),
    () => 'request-123',
  );
  const result = await client.appendSmokeTest(' hello\nworld '.repeat(30));
  assert.equal(result.requestId, 'request-123');
  assert.equal(calls.length, 2);
  assert(calls[1]!.url.includes(encodeURIComponent("'UAT_写入测试'!A:E")));
  assert(!calls[1]!.url.includes('主表'));
  const payload = JSON.parse(String(calls[1]!.init?.body)) as { values: unknown[][] };
  assert.equal(payload.values.length, 1);
  assert.deepEqual(payload.values[0]!.slice(0, 4), ['2026-08-21T01:02:03.000Z', 'request-123', 'API_ENDPOINT', 'PASS']);
  assert.equal(String(payload.values[0]![4]).length, 200);
  assert(!String(payload.values[0]![4]).includes('\n'));
});
