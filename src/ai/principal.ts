import { timingSafeEqual } from 'node:crypto';
import { WarehouseAuthenticationError } from '../auth/authContext.js';
import { authenticateWarehouseRequest } from '../auth/requestAuth.js';
import type { WarehouseRole } from '../auth/types.js';
import type { AiCapability } from './capabilities.js';

export interface AiPrincipal {
  principalId: string;
  principalType: 'SERVICE' | 'FEISHU_USER';
  userId?: string;
  capabilities: AiCapability[];
  authenticatedAt: string;
}

export const LEGACY_SERVICE_CAPABILITIES: readonly AiCapability[] = [
  'warehouse.inventory.read', 'warehouse.sn.read', 'warehouse.movement.read',
  'warehouse.exception.read', 'warehouse.sop.read',
];

const ROLE_AI_CAPABILITIES: Readonly<Record<WarehouseRole, readonly AiCapability[]>> = Object.freeze({
  READ_ONLY: ['warehouse.inventory.read', 'warehouse.sn.read', 'warehouse.movement.read', 'warehouse.exception.read', 'warehouse.sop.read'],
  WAREHOUSE_OPERATOR: ['warehouse.inventory.read', 'warehouse.sn.read', 'warehouse.movement.read', 'warehouse.exception.read', 'warehouse.sop.read', 'warehouse.recommend'],
  WAREHOUSE_ADMIN: ['warehouse.inventory.read', 'warehouse.sn.read', 'warehouse.movement.read', 'warehouse.exception.read', 'warehouse.sop.read', 'warehouse.recommend'],
});

export function authenticateAiPrincipal(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): AiPrincipal {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    const supplied = match?.[1]?.trim();
    const expected = env.WAREHOUSE_AI_READ_TOKEN?.trim();
    if (!supplied || !expected || expected.length < 32 || !safeEqual(supplied, expected)) {
      throw new WarehouseAuthenticationError('Invalid AI service credential.');
    }
    return { principalId: 'legacy-ai-service', principalType: 'SERVICE', capabilities: [...LEGACY_SERVICE_CAPABILITIES], authenticatedAt: now.toISOString() };
  }
  const context = authenticateWarehouseRequest(request, 'DASHBOARD_READ');
  const capabilities = [...new Set(context.user.roles.flatMap((role) => ROLE_AI_CAPABILITIES[role]))];
  return { principalId: `feishu:${context.user.userId}`, principalType: 'FEISHU_USER', userId: context.user.userId, capabilities, authenticatedAt: now.toISOString() };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
