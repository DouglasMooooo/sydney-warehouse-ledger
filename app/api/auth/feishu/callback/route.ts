import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiFailure } from '../../../../../src/application/apiResponse';
import { FeishuIdentityError, FeishuOAuthIdentityProvider, feishuOAuthConfigFromEnv } from '../../../../../src/auth/feishuIdentity';
import { rolesForFeishuUser } from '../../../../../src/auth/roleMapping';
import { createSessionToken, sessionCookieName, sessionCookieOptions } from '../../../../../src/auth/session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const cookies = parseCookies(request.headers.get('cookie'));
  if (!safeEqual(state, cookies.warehouse_oauth_state) || !cookies.warehouse_oauth_verifier || !code) {
    return finish(NextResponse.json(apiFailure('AUTHENTICATION_REQUIRED', '飞书登录状态无效或已过期。'), { status: 401 }));
  }
  try {
    const user = await new FeishuOAuthIdentityProvider(feishuOAuthConfigFromEnv())
      .resolveUser(code, cookies.warehouse_oauth_verifier);
    const roles = rolesForFeishuUser(user.openId);
    if (roles.length === 0) return finish(new NextResponse(
      '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>无访问权限</title><body><main><h1>当前账号未获得仓库系统权限</h1><p>请联系仓库系统管理员配置 UAT 角色。</p><a href="/">返回登录页</a></main></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ));
    const runtime = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const context = { identitySource: 'FEISHU' as const, user: { userId: user.openId, roles, ...(user.displayName ? { displayName: user.displayName } : {}) } };
    const secret = process.env.WAREHOUSE_SESSION_SECRET?.trim();
    if (!secret) throw new Error('WAREHOUSE_SESSION_SECRET_MISSING');
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.set(sessionCookieName(runtime), createSessionToken(context, secret), sessionCookieOptions(runtime));
    return finish(response);
  } catch (error) {
    if (error instanceof FeishuIdentityError) {
      console.error('Feishu OAuth identity failed', { stage: error.stage, providerCode: error.providerCode ?? null });
    }
    return finish(NextResponse.json(apiFailure('AUTHENTICATION_REQUIRED', '飞书身份验证失败。'), { status: 401 }));
  }
}

function finish(response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === 'production';
  const options = { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, path: '/', maxAge: 0 };
  response.cookies.set('warehouse_oauth_state', '', options);
  response.cookies.set('warehouse_oauth_verifier', '', options);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function parseCookies(header: string | null): Record<string, string> {
  return Object.fromEntries((header ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [key = '', ...value] = part.split('='); return [key, decodeURIComponent(value.join('='))];
  }));
}

function safeEqual(left: string, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
