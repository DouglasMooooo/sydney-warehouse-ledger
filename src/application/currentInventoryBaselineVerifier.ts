import type { TypedSheetData } from '../feishu/types.js';
import type { CurrentInventorySourceType } from './currentInventoryProjection.js';

const AUTHORITY_HEADERS = ['sku', '料号', '物料号', '产品料号', 'model', '机型', '型号', 'location', '库位', '当前库位', '库位编码', 'availableqty', '可用数量', '可用库存', '当前数量', 'stockcondition', '库存属性', '属性', 'sn', '序列号', 'serialnumber', 'container', '容器', '容器码'];
export interface BaselineVerification { valid: boolean; sourceType: CurrentInventorySourceType; formulaCells: string[]; code?: 'CURRENT_INVENTORY_BASELINE_HAS_FORMULAS' }
export function verifyCurrentInventoryBaseline(table: TypedSheetData, sourceType: CurrentInventorySourceType): BaselineVerification {
  const authority = new Set(AUTHORITY_HEADERS.map(normalize));
  const formulaCells = Object.entries(table.formulas ?? {}).flatMap(([column, formulas]) => authority.has(normalize(column)) ? formulas.filter(Boolean).map((formula, index) => `${column}${index + 2}:${formula}`) : []);
  return formulaCells.length ? { valid: false, sourceType, formulaCells, code: 'CURRENT_INVENTORY_BASELINE_HAS_FORMULAS' } : { valid: true, sourceType, formulaCells: [] };
}
function normalize(value: string): string { return value.toLowerCase().replace(/[\s_()\-]/g, ''); }
