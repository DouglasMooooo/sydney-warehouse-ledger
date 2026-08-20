import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WarehouseAuthContext, WarehouseRole } from './types.js';
import { WAREHOUSE_ROLES } from './types.js';

const SESSION_VERSION = 1;
export const SESSION_TTL_SECONDS = 30 * 60;

interface SessionPayload {
  v: number;
  sub: string;
  name?: string;
  roles: WarehouseRole[];
  iat: number;
  exp: number;
}

export function sessionCookieName(runtime: 'development' | 'test' | 'production'): string {
  return runtime === 'production' ? '__Host-warehouse_session' : 'warehouse_session';
}

export function createSessionToken(
  context: WarehouseAuthContext,
  secret: string,
  now: Date = new Date(),
): string {
  assertSecret(secret);
  if (context.identitySource !== 'FEISHU') throw new Error('ONLY_VERIFIED_FEISHU_SESSION_ALLOWED');
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    v: SESSION_VERSION,
    sub: context.user.userId,
    roles: [...context.user.roles],
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  if (context.user.displayName) payload.name = context.user.displayName;
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readSessionToken(token: string, secret: string, now: Date = new Date()): WarehouseAuthContext | undefined {
  try {
    assertSecret(secret);
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra !== undefined) return undefined;
    const expected = Buffer.from(sign(encoded, secret));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (payload.v !== SESSION_VERSION || typeof payload.sub !== 'string' || !payload.sub ||
      typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || payload.iat > nowSeconds + 60 ||
      payload.exp <= nowSeconds || payload.exp - payload.iat > SESSION_TTL_SECONDS || !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => WAREHOUSE_ROLES.includes(role))) return undefined;
    const user: WarehouseAuthContext['user'] = { userId: payload.sub, roles: [...payload.roles] };
    if (typeof payload.name === 'string' && payload.name) user.displayName = payload.name;
    return { identitySource: 'FEISHU', user };
  } catch {
    return undefined;
  }
}

export function sessionCookieOptions(runtime: 'development' | 'test' | 'production') {
  return { httpOnly: true, secure: runtime === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL_SECONDS };
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function assertSecret(secret: string): void {
  if (secret.length < 32) throw new Error('WAREHOUSE_SESSION_SECRET_TOO_SHORT');
}
