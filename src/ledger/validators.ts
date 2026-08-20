import type { LedgerAction, StockCondition } from '../config/controlledValues.js';
import type { BusinessDate } from './businessDate.js';

export interface NormalizedLedgerInput {
  date?: BusinessDate;
  outboundDate?: BusinessDate;
  action?: LedgerAction;
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
  /** Current condition supplied by a trusted inventory lookup; never written to the ledger. */
  sourceStockCondition?: StockCondition;
  remark?: string;
}

export interface ValidationError {
  code: string;
  field: keyof NormalizedLedgerInput;
  message?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const addRequired = (
  errors: ValidationError[], input: NormalizedLedgerInput,
  field: keyof NormalizedLedgerInput, code: string,
) => {
  if (input[field] === undefined || input[field] === '') errors.push({ code, field });
};

export function validateLedgerInput(input: NormalizedLedgerInput): ValidationResult {
  const errors: ValidationError[] = [];
  addRequired(errors, input, 'action', 'MISSING_ACTION');
  if (!input.action) return { ok: false, errors };

  if (input.qty !== undefined && (input.qty <= 0 || !Number.isFinite(input.qty))) {
    errors.push({ code: 'INVALID_QTY', field: 'qty' });
  }
  if (input.sn && input.qty !== 1) errors.push({ code: 'SERIALIZED_QTY_MUST_BE_ONE', field: 'qty' });

  const preparedFields = () => {
    addRequired(errors, input, 'date', 'MISSING_DATE');
    addRequired(errors, input, 'shNo', 'MISSING_SH');
    addRequired(errors, input, 'pickupCode', 'PREPARED_WITHOUT_PICKUP_CODE');
    addRequired(errors, input, 'sku', 'MISSING_SKU');
    addRequired(errors, input, 'qty', 'INVALID_QTY');
    addRequired(errors, input, 'fromLocation', 'PREPARED_WITHOUT_SOURCE_LOCATION');
    addRequired(errors, input, 'erpWarehouse', 'MISSING_ERP_WAREHOUSE');
    addRequired(errors, input, 'stockCondition', 'INVALID_STOCK_CONDITION');
  };

  switch (input.action) {
    case '期初库存':
    case '入库':
      addRequired(errors, input, 'date', 'MISSING_DATE');
      addRequired(errors, input, 'qty', 'INVALID_QTY');
      addRequired(errors, input, 'toLocation', 'MISSING_TARGET_LOCATION');
      addRequired(errors, input, 'stockCondition', 'INVALID_STOCK_CONDITION');
      break;
    case '备货':
      preparedFields();
      if (input.outboundDate !== undefined) {
        errors.push({ code: 'PREPARED_OUTBOUND_DATE_MUST_BE_BLANK', field: 'outboundDate' });
      }
      break;
    case '出库':
      preparedFields();
      addRequired(errors, input, 'outboundDate', 'MISSING_OUTBOUND_DATE');
      if (input.stockCondition !== '物料') addRequired(errors, input, 'sn', 'PRODUCT_OUTBOUND_WITHOUT_SN');
      break;
    case '退回维修':
      addRequired(errors, input, 'date', 'MISSING_DATE');
      addRequired(errors, input, 'sn', 'MISSING_SN');
      addRequired(errors, input, 'qty', 'INVALID_QTY');
      addRequired(errors, input, 'toLocation', 'RETURN_WITHOUT_TARGET_LOCATION');
      if (input.stockCondition !== '待修') errors.push({ code: 'RETURN_REQUIRES_PENDING_REPAIR', field: 'stockCondition' });
      break;
    case '移库':
      addRequired(errors, input, 'date', 'MISSING_DATE');
      addRequired(errors, input, 'qty', 'INVALID_QTY');
      addRequired(errors, input, 'fromLocation', 'MOVE_WITHOUT_SOURCE');
      addRequired(errors, input, 'toLocation', 'MOVE_WITHOUT_TARGET');
      addRequired(errors, input, 'stockCondition', 'INVALID_STOCK_CONDITION');
      addRequired(errors, input, 'sourceStockCondition', 'MOVE_SOURCE_CONDITION_REQUIRED');
      if (
        input.sourceStockCondition !== undefined
        && input.stockCondition !== undefined
        && input.sourceStockCondition !== input.stockCondition
      ) {
        errors.push({ code: 'MOVE_CANNOT_CHANGE_STOCK_CONDITION', field: 'stockCondition' });
      }
      break;
    case '库存调增':
      addRequired(errors, input, 'date', 'MISSING_DATE');
      addRequired(errors, input, 'qty', 'INVALID_QTY');
      addRequired(errors, input, 'toLocation', 'ADJUSTMENT_WITHOUT_TARGET');
      addRequired(errors, input, 'stockCondition', 'INVALID_STOCK_CONDITION');
      break;
    case '库存调减':
      addRequired(errors, input, 'date', 'MISSING_DATE');
      addRequired(errors, input, 'qty', 'INVALID_QTY');
      addRequired(errors, input, 'fromLocation', 'ADJUSTMENT_WITHOUT_SOURCE');
      addRequired(errors, input, 'stockCondition', 'INVALID_STOCK_CONDITION');
      break;
    default:
      assertNever(input.action);
  }
  return { ok: errors.length === 0, errors };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled action: ${String(value)}`);
}
