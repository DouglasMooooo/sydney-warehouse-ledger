import type { InventoryCandidate } from '../contracts.js';
import { STOCK_CONDITIONS } from '../../config/controlledValues.js';

export interface InventoryQuery { sku?: string; displayName?: string; location?: string; stockCondition?: string }
export interface InventoryQueryResult {
  items: Array<{ sku: string; displayName?: string; stockCondition: string; totalQty: number;
    locations: Array<{ location: string; qty: number; containers?: string[] }>; exceptionCount?: number }>;
}
export interface InventoryReadPort { readCurrentInventory(): Promise<InventoryCandidate[]> }
export interface InventoryQueryService { search(query: InventoryQuery): Promise<InventoryQueryResult> }

export class LiveInventoryQueryService implements InventoryQueryService {
  constructor(private readonly port: InventoryReadPort) {}
  async search(query: InventoryQuery): Promise<InventoryQueryResult> {
    const filters = validateQuery(query);
    const rows = (await this.port.readCurrentInventory()).filter((row) =>
      matches(row.sku, filters.sku) && matches(row.displayName ?? row.model ?? '', filters.displayName)
      && matches(row.location, filters.location) && matches(row.condition, filters.stockCondition));
    const groups = new Map<string, InventoryQueryResult['items'][number]>();
    for (const row of rows) {
      const key = `${normalize(row.sku)}\u0000${normalize(row.condition)}`;
      let item = groups.get(key);
      if (!item) {
        const displayName=row.displayName??row.model;
        item = { sku: row.sku, ...(displayName ? { displayName } : {}), stockCondition: row.condition, totalQty: 0, locations: [] };
        groups.set(key, item);
      }
      item.totalQty += row.availableQty;
      let location = item.locations.find((candidate) => normalize(candidate.location) === normalize(row.location));
      if (!location) { location = { location: row.location, qty: 0 }; item.locations.push(location); }
      location.qty += row.availableQty;
      if (row.container) location.containers = [...new Set([...(location.containers ?? []), row.container])];
    }
    return { items: [...groups.values()].sort((a, b) => a.sku.localeCompare(b.sku) || a.stockCondition.localeCompare(b.stockCondition)) };
  }
}

function validateQuery(query: InventoryQuery): InventoryQuery {
  const result: InventoryQuery = {};
  for (const key of ['sku','displayName','location','stockCondition'] as const) {
    const value = query[key]?.trim();
    if (value && value.length > 120) throw new TypeError(`INVALID_INVENTORY_FILTER:${key}`);
    if (value) result[key] = value;
  }
  if (result.stockCondition && !STOCK_CONDITIONS.some((value) => normalize(value) === normalize(result.stockCondition!))) {
    throw new TypeError('INVALID_INVENTORY_FILTER:stockCondition');
  }
  return result;
}
function normalize(value: string): string { return value.trim().toUpperCase(); }
function matches(value: string, filter?: string): boolean { return !filter || normalize(value) === normalize(filter); }
