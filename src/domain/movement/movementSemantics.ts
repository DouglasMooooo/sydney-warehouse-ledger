import { ACTION_RULES, type InventoryWorkflow } from '../../application/inventoryActionEngine.js';
import type { LedgerAction } from '../../config/controlledValues.js';
import type { MovementInventoryEffect } from './types.js';

const WORKFLOW_BY_ACTION: Partial<Record<LedgerAction,InventoryWorkflow>>={
  '期初库存':'OPENING_BALANCE','备货':'PREPARE','出库':'OUTBOUND','退回维修':'RETURN_REPAIR','入库':'INBOUND','移库':'MOVE',
};

export function movementSemantics(action: LedgerAction, repairComplete=false): {workflow?:InventoryWorkflow;inventoryEffect:MovementInventoryEffect} {
  if(repairComplete)return {workflow:'REPAIR_COMPLETE',inventoryEffect:'STATE_TRANSITION'};
  const workflow=WORKFLOW_BY_ACTION[action] ?? (action==='库存调增'?'ADJUST_INCREASE':action==='库存调减'?'ADJUST_DECREASE':undefined);
  if(!workflow)return {inventoryEffect:'NONE'};
  const effect=ACTION_RULES[workflow].inventoryEffect;
  return {workflow,inventoryEffect:effect==='none'?'NONE':effect==='increase'?'INCREASE':effect==='decrease'?'DECREASE':'TRANSFER'};
}
