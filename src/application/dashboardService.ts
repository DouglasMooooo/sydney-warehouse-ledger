import type { BusinessDate } from '../ledger/businessDate.js';
import type { DashboardQueryService, DashboardSnapshot, WarehouseReadPort } from './contracts.js';

export class LiveDashboardQueryService implements DashboardQueryService {
  constructor(private readonly port: WarehouseReadPort) {}

  getSnapshot(asOf: BusinessDate): Promise<DashboardSnapshot> {
    // No cache and no shadow inventory: every request reads the current Feishu-backed source.
    return this.port.readDashboardSource(asOf);
  }
}
