import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeishuAuthorizationUrl, FeishuIdentityError, FeishuOAuthIdentityProvider } from '../src/auth/feishuIdentity.js';

const config = { appId: 'cli_test', appSecret: 'server-secret', redirectUri: 'https://warehouse.example/api/auth/feishu/callback' };

test('Feishu OAuth adapter exchanges code server-side and returns only verified identity', async () => {
  const calls: string[] = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    if (String(input).includes('/oauth/v3/token')) {
      assert.equal((init?.headers as Record<string, string>)['content-type'], 'application/x-www-form-urlencoded');
      assert(init?.body instanceof URLSearchParams);
      assert.equal(init.body.get('client_secret'), 'server-secret');
      assert.equal(init.body.get('code_verifier'), 'v'.repeat(48));
      return Response.json({ code: 0, access_token: 'user-token', expires_in: 7200 });
    }
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer user-token');
    return Response.json({ code: 0, data: { open_id: 'ou_verified', name: 'Verified User', mobile: 'must-not-propagate' } });
  };
  const user = await new FeishuOAuthIdentityProvider(config, fakeFetch as typeof fetch).resolveUser('one-time-code', 'v'.repeat(48));
  assert.deepEqual(user, { openId: 'ou_verified', displayName: 'Verified User' });
  assert.equal(calls.length, 2);
});

test('invalid Feishu login code fails closed and OAuth URL uses state plus S256 PKCE', async () => {
  const provider = new FeishuOAuthIdentityProvider(config, (async () => Response.json({ code: 20003 }, { status: 400 })) as typeof fetch);
  await assert.rejects(() => provider.resolveUser('invalid', 'v'.repeat(48)), (error: unknown) => {
    assert(error instanceof FeishuIdentityError);
    assert.equal(error.stage, 'TOKEN_EXCHANGE');
    assert.equal(error.providerCode, 20003);
    return true;
  });
  const url = new URL(createFeishuAuthorizationUrl(config, 'state-value', 'v'.repeat(48)));
  assert.equal(url.origin, 'https://accounts.feishu.cn');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert(!url.toString().includes('server-secret'));
});
