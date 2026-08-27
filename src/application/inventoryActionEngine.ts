import type { StockCondition, LedgerAction } from '../config/controlledValues.js';
import type { LedgerWriteInput } from '../ledger/typedWrite.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import type { WarehouseReadPort } from './contracts.js';
import { toRepairedGoodSn } from '../snResolver/resolver.js';
import { isOperationalShNumber } from './shNumber.js';
import { randomUUID } from 'node:crypto';

export const INVENTORY_WORKFLOWS = [
  'PREPARE', 'OUTBOUND', 'RETURN_REPAIR', 'INBOUND', 'MOVE', 'REPAIR_COMPLETE',
  'ADJUST_INCREASE', 'ADJUST_DECREASE', 'OPENING_BALANCE',
] as const;

export type InventoryWorkflow = (typeof INVENTORY_WORKFLOWS)[number];
export type InventoryEffect = 'none' | 'increase' | 'decrease' | 'transfer';
export type StockConditionPolicy = 'preserve' | 'user' | 'new' | 'repair-good' | 'repair-pending';

export interface ActionRule {
  workflow: InventoryWorkflow;
  label: string;
  ledgerAction: LedgerAction;
  inventoryEffect: InventoryEffect;
  sourceRequired: boolean;
  targetRequired: boolean;
  snPolicy: 'required' | 'optional' | 'lookup';
  actualOutboundDateRequired: boolean;
  shRequired: boolean;
  pickupCodeRequired: boolean;
  stockConditionPolicy: StockConditionPolicy;
  reasonRequired: boolean;
  adminOnly?: boolean;
}

export const ACTION_RULES: Readonly<Record<InventoryWorkflow, ActionRule>> = Object.freeze({
  PREPARE: rule('PREPARE', '工单备货', '备货', 'none', true, false, 'required', false, true, true, 'user', false),
  OUTBOUND: rule('OUTBOUND', '确认出库', '出库', 'decrease', true, false, 'required', true, true, true, 'preserve', false),
  RETURN_REPAIR: rule('RETURN_REPAIR', '坏机接收', '退回维修', 'increase', false, true, 'required', false, true, false, 'repair-pending', false),
  INBOUND: rule('INBOUND', '正常入库', '入库', 'increase', false, true, 'required', false, false, false, 'user', false),
  MOVE: rule('MOVE', '移库', '移库', 'transfer', true, true, 'lookup', false, false, false, 'preserve', false),
  REPAIR_COMPLETE: rule('REPAIR_COMPLETE', '维修完成', '库存调增', 'transfer', true, true, 'lookup', false, false, false, 'repair-good', false),
  ADJUST_INCREASE: rule('ADJUST_INCREASE', '库存调增', '库存调增', 'increase', false, true, 'optional', false, false, false, 'user', true),
  ADJUST_DECREASE: rule('ADJUST_DECREASE', '库存调减', '库存调减', 'decrease', true, false, 'optional', false, false, false, 'preserve', true),
  OPENING_BALANCE: { ...rule('OPENING_BALANCE', '期初库存', '期初库存', 'increase', false, true, 'optional', false, false, false, 'user', false), adminOnly: true },
});

export const ADJUSTMENT_REASONS = [
  'Physical count correction', 'ERP/WMS reconciliation', 'Historical data correction',
  'Scrap/write-off', 'Missing transaction recovery', 'Repair state correction', 'Other',
] as const;

export interface InventoryWorkflowInput {
  commandId?: string;
  workflow: InventoryWorkflow;
  date?: string;
  outboundDate?: string;
  reference?: string;
  shNo?: string;
  pickupCode?: string;
  containerCode?: string;
  sku?: string;
  sn?: string;
  qty?: number;
  fromLocation?: string;
  toLocation?: string;
  erpWarehouse?: string;
  stockCondition?: StockCondition;
  adjustmentReason?: (typeof ADJUSTMENT_REASONS)[number] | string;
  remark?: string;
  importReference?: string;
}

export interface InventoryWorkflowPreview {
  commandId: string;
  workflow: InventoryWorkflow;
  label: string;
  ledgerAction: LedgerAction | '库存调减 + 库存调增';
  inventoryEffect: InventoryEffect;
  rows: LedgerWriteInput[];
  before?: { sku: string; location: string; qty: number; stockCondition: StockCondition };
  after?: { sku: string; location: string; qty: number; stockCondition: StockCondition };
  warnings: string[];
}

export async function prepareInventoryWorkflow(input: InventoryWorkflowInput, port: WarehouseReadPort): Promise<InventoryWorkflowPreview> {
  if (!INVENTORY_WORKFLOWS.includes(input.workflow)) throw new TypeError('UNSUPPORTED_INVENTORY_WORKFLOW');
  const rule = ACTION_RULES[input.workflow];
  const date = required(input.date, 'MISSING_DATE');
  const sn = input.sn?.trim() ? cleanSn(input.sn) : '';
  const warnings: string[] = [];
  let rows: LedgerWriteInput[];
  let before: InventoryWorkflowPreview['before'];
  let after: InventoryWorkflowPreview['after'];

  switch (input.workflow) {
    case 'PREPARE':
      throw new TypeError('PREPARE_USES_WORK_ORDER_SERVICE');
    case 'OUTBOUND': {
      const reference = required(input.reference ?? input.pickupCode ?? input.shNo, 'OUTBOUND_REFERENCE_REQUIRED');
      if (!port.findPreparedByReference) throw new TypeError('PREPARED_LOOKUP_UNAVAILABLE');
      const requiredSn = required(sn, 'MISSING_SN');
      const prepared = await port.findPreparedByReference(reference, requiredSn);
      if (!prepared) throw new TypeError('PREPARED_TRANSACTION_NOT_FOUND');
      if (port.findCurrentSerializedInventory) {
        const current = await port.findCurrentSerializedInventory(requiredSn);
        if (current?.currentState === 'OUTBOUND') throw new TypeError('SN_ALREADY_OUTBOUND');
      }
      rows = [{ date, outboundDate: required(input.outboundDate, 'MISSING_OUTBOUND_DATE'), action: '出库', shNo: prepared.shNo,
        pickupCode: prepared.pickupCode, sku: prepared.sku, sn: requiredSn, qty: 1, fromLocation: prepared.location,
        erpWarehouse: prepared.erpWarehouse, stockCondition: prepared.stockCondition,
        ...(prepared.containerCode ? { containerCode: prepared.containerCode } : {}) }];
      break;
    }
    case 'RETURN_REPAIR': {
      const confirmedSh = required(input.shNo, 'CONFIRMED_SH_REQUIRED');
      if (!isOperationalShNumber(confirmedSh)) throw new TypeError('INVALID_SH_REFERENCE');
      rows = [{ date, action: '退回维修', sn: required(sn, 'MISSING_SN'), shNo: confirmedSh, qty: 1, toLocation: 'REPAIR-01', stockCondition: '待修',
        ...(input.sku?.trim() ? { sku: input.sku } : {}),
        ...(input.remark?.trim() ? { remark: input.remark } : {}) }];
      if (!input.sku?.trim()) warnings.push('料号未知：接收后进入待补资料队列。');
      break;
    }
    case 'INBOUND':
      rows = [{ date, action: '入库', sku: required(input.sku, 'MISSING_SKU'), sn: required(sn, 'MISSING_SN'), qty: 1,
        toLocation: required(input.toLocation, 'MISSING_TARGET_LOCATION'), stockCondition: requiredCondition(input.stockCondition),
        ...(input.containerCode?.trim() ? { containerCode: input.containerCode } : {}), ...(input.remark?.trim() ? { remark: input.remark } : {}) }];
      if (!await port.findProduct(required(input.sku, 'MISSING_SKU'))) throw new TypeError('PRODUCT_MASTER_NOT_FOUND');
      break;
    case 'MOVE': {
      const current = await currentBySn(port, required(sn, 'MISSING_SN'));
      const target = required(input.toLocation, 'MOVE_WITHOUT_TARGET');
      if (current.location === target) throw new TypeError('MOVE_SOURCE_EQUALS_TARGET');
      before = { sku: current.sku, location: current.location, qty: 1, stockCondition: current.stockCondition };
      after = { ...before, location: target };
      rows = [{ date, action: '移库', sku: current.sku, sn: required(sn, 'MISSING_SN'), qty: 1, fromLocation: current.location,
        toLocation: target, stockCondition: current.stockCondition, sourceStockCondition: current.stockCondition,
        ...(current.containerCode ? { containerCode: current.containerCode } : {}) }];
      break;
    }
    case 'REPAIR_COMPLETE': {
      const current = await currentBySn(port, required(sn, 'MISSING_SN'));
      if (current.stockCondition !== '待修' || current.currentState !== 'REPAIR') throw new TypeError('REPAIR_COMPLETE_REQUIRES_PENDING_REPAIR');
      const target = required(input.toLocation, 'MISSING_TARGET_LOCATION');
      if (current.location === target) throw new TypeError('MOVE_SOURCE_EQUALS_TARGET');
      const repairedSn = toRepairedGoodSn(sn);
      before = { sku: current.sku, location: current.location, qty: 1, stockCondition: '待修' };
      after = { sku: current.sku, location: target, qty: 1, stockCondition: '维修良品' };
      const audit = 'Repair state correction · 维修完成状态转换';
      rows = [
        { date, action: '库存调减', sku: current.sku, sn, qty: 1, fromLocation: current.location, stockCondition: '待修', remark: audit },
        { date, action: '库存调增', sku: current.sku, sn: repairedSn, qty: 1, toLocation: target, stockCondition: '维修良品', remark: `${audit} · SN ${sn} → ${repairedSn}` },
      ];
      warnings.push(`系统将关闭“待修”SN ${sn}，并以维修良品 SN ${repairedSn} 入账；总数量保持不变。`);
      break;
    }
    case 'ADJUST_INCREASE':
    case 'ADJUST_DECREASE': {
      const increase = input.workflow === 'ADJUST_INCREASE';
      const reason = required(input.adjustmentReason, 'ADJUSTMENT_REASON_REQUIRED');
      if (!ADJUSTMENT_REASONS.includes(reason as never)) throw new TypeError('INVALID_ADJUSTMENT_REASON');
      if (reason === 'Other' && !input.remark?.trim()) throw new TypeError('ADJUSTMENT_OTHER_REMARK_REQUIRED');
      const sku = required(input.sku, 'MISSING_SKU');
      const qty = requiredQty(input.qty);
      const condition = requiredCondition(input.stockCondition);
      const location = required(increase ? input.toLocation : input.fromLocation, increase ? 'ADJUSTMENT_WITHOUT_TARGET' : 'ADJUSTMENT_WITHOUT_SOURCE');
      if (!increase) {
        const candidates = await port.findAvailableInventory(sku, condition, qty);
        const current = candidates.find((item) => item.location === location && item.availableQty >= qty);
        if (!current) throw new TypeError('SOURCE_INVENTORY_NOT_AVAILABLE');
        before = { sku, location, qty: current.availableQty, stockCondition: condition };
        after = { ...before, qty: current.availableQty - qty };
      }
      const remark = `${reason}${input.remark?.trim() ? ` · ${input.remark.trim()}` : ''}`;
      rows = [{ date, action: increase ? '库存调增' : '库存调减', sku, qty, stockCondition: condition, remark,
        ...(sn ? { sn } : {}), ...(increase ? { toLocation: location } : { fromLocation: location }) }];
      break;
    }
    case 'OPENING_BALANCE':
      rows = [{ date, action: '期初库存', sku: required(input.sku, 'MISSING_SKU'), qty: requiredQty(input.qty),
        toLocation: required(input.toLocation, 'MISSING_TARGET_LOCATION'), stockCondition: requiredCondition(input.stockCondition),
        remark: `Import reference: ${required(input.importReference, 'OPENING_BALANCE_REFERENCE_REQUIRED')}`,
        ...(sn ? { sn } : {}) }];
      warnings.push('管理员初始化操作：不得用于日常库存差异修正。');
      break;
  }

  for (const row of rows) {
    const validated = prepareLedgerWrite(row, true);
    if (!validated.ok) throw new TypeError(`LEDGER_VALIDATION_FAILED:${validated.errors.map((item) => item.code).join(',')}`);
  }
  const commandId = input.commandId?.trim() || `CMD-${randomUUID()}`;
  const preview: InventoryWorkflowPreview = { commandId, workflow: input.workflow, label: rule.label,
    ledgerAction: input.workflow === 'REPAIR_COMPLETE' ? '库存调减 + 库存调增' : rule.ledgerAction,
    inventoryEffect: rule.inventoryEffect, rows, warnings };
  if (before) preview.before = before;
  if (after) preview.after = after;
  return preview;
}

function rule(workflow: InventoryWorkflow, label: string, ledgerAction: LedgerAction, inventoryEffect: InventoryEffect,
  sourceRequired: boolean, targetRequired: boolean, snPolicy: ActionRule['snPolicy'], actualOutboundDateRequired: boolean,
  shRequired: boolean, pickupCodeRequired: boolean, stockConditionPolicy: StockConditionPolicy, reasonRequired: boolean): ActionRule {
  return { workflow, label, ledgerAction, inventoryEffect, sourceRequired, targetRequired, snPolicy,
    actualOutboundDateRequired, shRequired, pickupCodeRequired, stockConditionPolicy, reasonRequired };
}

function required(value: string | undefined, code: string): string {
  const cleaned = value?.trim(); if (!cleaned) throw new TypeError(code); return cleaned;
}
function cleanSn(value: string | undefined): string { return required(value, 'MISSING_SN').toUpperCase().replace(/\s+/g, ''); }
function requiredQty(value: number | undefined): number { if (!Number.isFinite(value) || !value || value <= 0) throw new TypeError('INVALID_QTY'); return value; }
function requiredCondition(value: StockCondition | undefined): StockCondition { if (!value) throw new TypeError('INVALID_STOCK_CONDITION'); return value; }
async function currentBySn(port: WarehouseReadPort, sn: string) {
  if (!port.findCurrentSerializedInventory) throw new TypeError('CURRENT_SN_LOOKUP_UNAVAILABLE');
  const current = await port.findCurrentSerializedInventory(sn);
  if (!current || current.currentState === 'OUTBOUND') throw new TypeError('SN_NOT_IN_CURRENT_INVENTORY');
  return current;
}
