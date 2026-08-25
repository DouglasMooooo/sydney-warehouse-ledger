export const AI_CAPABILITIES = [
  'warehouse.inventory.read',
  'warehouse.sn.read',
  'warehouse.movement.read',
  'warehouse.exception.read',
  'warehouse.sop.read',
  'warehouse.recommend',
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];
export const RESERVED_AI_CAPABILITIES = ['warehouse.preview.create'] as const;

export interface CapabilityPrincipal { capabilities: readonly AiCapability[] }

export class AiCapabilityError extends Error {
  readonly code = 'AI_CAPABILITY_REQUIRED';
  constructor(readonly capability: AiCapability) { super(`AI capability required: ${capability}`); }
}

export function requireAiCapability(principal: CapabilityPrincipal, capability: AiCapability): void {
  if (!principal.capabilities.includes(capability)) throw new AiCapabilityError(capability);
}
