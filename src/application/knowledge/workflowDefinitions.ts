import { ACTION_RULES, type ActionRule, type InventoryWorkflow } from '../inventoryActionEngine.js';
import type { WorkflowKnowledge } from './workflowKnowledge.js';

const EXPOSED_WORKFLOWS = ['PREPARE','OUTBOUND','RETURN_REPAIR','INBOUND','MOVE','REPAIR_COMPLETE','ADJUST_INCREASE','ADJUST_DECREASE'] as const;
type ExposedWorkflow = (typeof EXPOSED_WORKFLOWS)[number];

const procedures: Record<ExposedWorkflow, Pick<WorkflowKnowledge, 'purpose'|'steps'|'validations'|'commonExceptions'|'escalation'> & { extraRequired?: string[]; defaults?: Record<string,string>; availability?: WorkflowKnowledge['availability'] }> = {
  PREPARE: procedure('Reserve stock for a confirmed work order before physical picking.', ['Review work order','Generate label','Scan SN','Confirm suggested location','Human confirmation'], ['SH and pickup code are required.']),
  OUTBOUND: procedure('Confirm physical dispatch of prepared stock.', ['Select prepared items','Verify SN','Enter actual outbound date','Review','Human confirmation'], ['Prepared transaction, SH and pickup code must match.']),
  RETURN_REPAIR: {
    purpose: 'Receive a returned bad machine into the repair area with a confirmed operational SH.',
    steps: steps(['Scan / input SN','Resolve SKU / product','Resolve SH','Validate current inventory','Review','Human confirmation','Commit return','Re-read / verify']),
    extraRequired: ['confirmedSh'], defaults: { targetLocation: 'REPAIR-01', stockCondition: '待修', qty: '1' },
    validations: ['Return cannot complete without confirmed SH.','TH-* is historical evidence only and is never an operational SH.','SH resolution remains dependency pending in the current execution workflow.'],
    commonExceptions: ['Unknown SKU','No confirmed operational SH','SN already present in repair stock'],
    escalation: ['Send unresolved SH or current-state conflicts to a warehouse administrator.'], availability: 'DEPENDENCY_PENDING',
  },
  INBOUND: procedure('Receive normal inventory into a confirmed warehouse location.', ['Identify product','Scan SN','Choose target location','Choose stock condition','Human confirmation'], ['Product and target location must exist.']),
  MOVE: procedure('Transfer current inventory between locations without changing total stock.', ['Scan SN','Read current location','Choose target location','Review transfer','Human confirmation'], ['Source and target must differ.']),
  REPAIR_COMPLETE: procedure('Convert a pending-repair unit into repaired-good stock.', ['Scan pending-repair SN','Validate repair state','Choose good-stock location','Preview SN state transition','Human confirmation'], ['Current state must be pending repair.']),
  ADJUST_INCREASE: procedure('Apply a controlled positive stock correction.', ['Enter SKU and quantity','Choose target and condition','Select reason','Review impact','Administrator confirmation'], ['A controlled adjustment reason is required.']),
  ADJUST_DECREASE: procedure('Apply a controlled negative stock correction.', ['Enter SKU and quantity','Choose source and condition','Select reason','Validate availability','Administrator confirmation'], ['Available source stock and a controlled reason are required.']),
};

export const WORKFLOW_DEFINITIONS: Readonly<Record<ExposedWorkflow, WorkflowKnowledge>> = Object.freeze(
  Object.fromEntries(EXPOSED_WORKFLOWS.map((id) => [id, definition(id, ACTION_RULES[id], procedures[id])])) as Record<ExposedWorkflow, WorkflowKnowledge>,
);

export function getWorkflowKnowledge(value: string): WorkflowKnowledge | undefined {
  const id = value.trim().toUpperCase() as ExposedWorkflow;
  return EXPOSED_WORKFLOWS.includes(id) ? WORKFLOW_DEFINITIONS[id] : undefined;
}

function definition(id: ExposedWorkflow, rule: ActionRule, details: typeof procedures[ExposedWorkflow]): WorkflowKnowledge {
  const base: WorkflowKnowledge = {
    id, name: rule.label, purpose: details.purpose, ledgerAction: rule.ledgerAction,
    inventoryEffect: id === 'REPAIR_COMPLETE' ? 'STATE_TRANSITION' : effect(rule.inventoryEffect),
    steps: details.steps, requiredFields: [...new Set([...requiredFields(rule).filter((field) => !(id === 'RETURN_REPAIR' && field === 'sh')), ...(details.extraRequired ?? [])])],
    validations: details.validations, commonExceptions: details.commonExceptions, escalation: details.escalation,
    humanConfirmationRequired: true, authoritativeSource: 'WORKFLOW_DEFINITION', availability: details.availability ?? 'AVAILABLE',
  };
  if (details.defaults) base.defaults = details.defaults;
  return base;
}

function requiredFields(rule: ActionRule): string[] {
  return ['businessDate', ...(rule.snPolicy === 'required' || rule.snPolicy === 'lookup' ? ['sn'] : []),
    ...(rule.sourceRequired ? ['sourceLocation'] : []), ...(rule.targetRequired ? ['targetLocation'] : []),
    ...(rule.actualOutboundDateRequired ? ['actualOutboundDate'] : []), ...(rule.shRequired ? ['sh'] : []),
    ...(rule.pickupCodeRequired ? ['pickupCode'] : []), ...(rule.reasonRequired ? ['adjustmentReason'] : [])];
}
function effect(value: ActionRule['inventoryEffect']): WorkflowKnowledge['inventoryEffect'] {
  return ({ none:'NONE', increase:'INCREASE', decrease:'DECREASE', transfer:'TRANSFER' } as const)[value];
}
function procedure(purpose: string, names: string[], validations: string[]) {
  return { purpose, steps: steps(names), validations, commonExceptions: ['Missing required field','Validation conflict'], escalation: ['Escalate blocked or ambiguous cases to a warehouse administrator.'] };
}
function steps(names: string[]): WorkflowKnowledge['steps'] { return names.map((title,index) => ({ order:index+1,title,instruction:title })); }
