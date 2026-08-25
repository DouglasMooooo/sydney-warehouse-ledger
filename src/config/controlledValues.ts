export const ACTIONS = [
  '期初库存', '备货', '出库', '退回维修', '入库', '移库', '库存调增', '库存调减',
] as const;

export const STOCK_CONDITIONS = ['新机', '维修良品', '待修', '报废', '物料'] as const;
export const ITEM_TYPES = ['成品', '物料'] as const;
export const ENABLED_STATUSES = ['是', '否'] as const;

export type LedgerAction = (typeof ACTIONS)[number];
export type StockCondition = (typeof STOCK_CONDITIONS)[number];

const actionSet = new Set<string>(ACTIONS);
const conditionSet = new Set<string>(STOCK_CONDITIONS);

export const isLedgerAction = (value: unknown): value is LedgerAction =>
  typeof value === 'string' && actionSet.has(value);

export const isStockCondition = (value: unknown): value is StockCondition =>
  typeof value === 'string' && conditionSet.has(value);
