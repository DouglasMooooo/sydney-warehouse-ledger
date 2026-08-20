import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createFeishuAuthorizationUrl, feishuOAuthConfigFromEnv } from '../../../../../src/auth/feishuIdentity';

export const runtime = 'nodejs';

export async function GET() {
  const runtime = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const response = NextResponse.redirect(createFeishuAuthorizationUrl(feishuOAuthConfigFromEnv(), state, verifier));
  const options = { httpOnly: true, secure: runtime === 'production', sameSite: 'lax' as const, path: '/', maxAge: 5 * 60 };
  response.cookies.set('warehouse_oauth_state', state, options);
  response.cookies.set('warehouse_oauth_verifier', verifier, options);
  return response;
}
