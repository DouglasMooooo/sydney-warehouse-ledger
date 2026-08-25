import type { InventoryWorkflow } from '../inventoryActionEngine.js';
export interface WorkflowKnowledge {
  id: InventoryWorkflow; name: string; purpose: string;
  ledgerAction: string;
  inventoryEffect: 'NONE' | 'INCREASE' | 'DECREASE' | 'TRANSFER' | 'STATE_TRANSITION';
  steps: Array<{ order: number; title: string; instruction: string }>;
  requiredFields: string[]; defaults?: Record<string, string>; validations: string[];
  commonExceptions: string[]; escalation: string[]; humanConfirmationRequired: boolean;
  authoritativeSource: 'WORKFLOW_DEFINITION'; availability: 'AVAILABLE' | 'DEPENDENCY_PENDING';
}
