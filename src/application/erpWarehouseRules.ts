import type { InventoryCandidate } from './contracts.js';

export type PreparedStockCondition = Extract<InventoryCandidate['condition'], '新机' | '维修良品'>;

/** Approved replacement-machine rules only. Unknown warehouses must fail closed. */
export const ERP_WAREHOUSE_RULES: Readonly<Record<string, PreparedStockCondition>> = Object.freeze({
  悉尼良品仓: '维修良品',
  悉尼物料仓: '新机',
  物料仓: '新机',
});

export class ErpWarehouseUnsupportedError extends Error {
  readonly code = 'ERP_WAREHOUSE_UNSUPPORTED' as const;

  constructor(readonly warehouse: string) {
    super(`Unsupported ERP warehouse: ${warehouse || '(blank)'}`);
    this.name = 'ErpWarehouseUnsupportedError';
  }
}

export function preparedConditionForWarehouse(value: string): PreparedStockCondition {
  const warehouse = value.trim();
  const condition = ERP_WAREHOUSE_RULES[warehouse];
  if (!warehouse || !condition) throw new ErpWarehouseUnsupportedError(warehouse);
  return condition;
}
