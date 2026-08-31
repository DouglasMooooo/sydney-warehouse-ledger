import { STOCK_CONDITIONS, type StockCondition } from '../config/controlledValues.js';
import type { BusinessDate } from '../ledger/businessDate.js';
import type {
  CurrentSerializedInventory, DashboardSnapshot, InventoryCandidate, OutboundTransaction, PreparedTransaction, ProductRecord, WarehouseReadPort,
} from '../application/contracts.js';
import { deriveTodayTasks, type OperationalLedgerRow, type TodayTaskSnapshot } from '../application/todayTasks.js';
import { formatLocationSummary, summarizeLocations, type LocationInventoryRecord, type LocationSummary } from '../application/locationSummary.js';
import {
  deriveLedgerExceptions, detectContainerMismatches, inventoryIssuesToOperationalExceptions,
  LIVE_OPERATIONAL_EXCEPTION_CODES, type OperationalException,
} from '../application/exceptionService.js';
import { requiredEnv } from './client.js';
import type { TypedSheetData } from './types.js';
import { parseSourceNumber } from './sourceValues.js';
import { LarkCliWarehouseSheetReader, warehouseSheetReaderFromEnv, type WarehouseSheetReader } from './sheetReader.js';
import { canonicalizeSn, normalizeSn } from '../snResolver/resolver.js';
import type { VerifiedSnMapping } from '../snResolver/types.js';
import type { MaterialOption, SnOperationalState, SnResolverContext } from '../application/badMachineReceive.js';
import { deriveWeeklyWarehouseReport, type WeeklyManualMetrics, type WeeklyWarehouseReport } from '../application/weeklyReport.js';
import type { MovementQuery, MovementReadPort } from '../application/queries/movementQueryService.js';
import type { InventoryMovement, OperationalLedgerRecord } from '../domain/movement/types.js';
import { DeterministicMovementProjectionService } from '../domain/movement/movementProjection.js';
import { DefaultMigrationPolicy } from '../domain/movement/migrationPolicy.js';
import { DeterministicSnLifecycleReplayService } from '../domain/sn/snLifecycleReplay.js';
import type { CurrentSnState } from '../domain/sn/types.js';
import { reversedOutboundLedgerRow } from '../application/outboundReversalMarker.js';
import { CurrentInventoryProjectionService, assertAuthoritativeBaseline, type CurrentInventorySourceType } from '../application/currentInventoryProjection.js';
import { parseSystemLedgerMarker } from './openApiLedgerWriter.js';
import { verifyCurrentInventoryBaseline } from '../application/currentInventoryBaselineVerifier.js';

const MAIN = {
  date: 0, outboundDate: 1, action: 2, sh: 3, pickup: 4, container: 5,
  sku: 6, model: 7, sn: 9, qty: 10, fromLocation: 11, toLocation: 12,
  erpWarehouse: 13, stockCondition: 15, remark: 21,
} as const;
const MOVEMENT_PROJECTOR=new DeterministicMovementProjectionService(new DefaultMigrationPolicy());
const CURRENT_INVENTORY_PROJECTOR = new CurrentInventoryProjectionService();

export interface FeishuWarehouseReadConfig {
  spreadsheetUrl: string;
  mainSheetId: string;
  currentInventorySheetId: string;
  currentInventoryAuthorityMode?: CurrentInventorySourceType;
  currentInventoryBaselineEffectiveAt?: string;
}

export class FeishuWarehouseReadAdapter implements WarehouseReadPort, MovementReadPort {
  private mainReadInFlight: Promise<TypedSheetData> | undefined;

  constructor(
    private readonly config: FeishuWarehouseReadConfig,
    private readonly reader: WarehouseSheetReader = new LarkCliWarehouseSheetReader(config.spreadsheetUrl),
  ) {}

  async readCurrentInventory(): Promise<InventoryCandidate[]> {
    return (await this.currentInventorySnapshot()).records;
  }

  async readLedgerRecords(query: MovementQuery = {}): Promise<OperationalLedgerRecord[]> {
    const rows=(await this.readMain()).data.slice(1).map((row,index)=>toMovementLedgerRecord(row,index+2)).filter((record)=>record.action);
    return rows.filter((record)=>movementRecordMatches(record,query));
  }

  async readDashboardSource(asOf: BusinessDate): Promise<DashboardSnapshot> {
    const [main, snapshot, validLocations] = await Promise.all([this.readMain(), this.currentInventorySnapshot(), this.readValidLocations()]);
    const mainRows = currentOperationalEntries(main).map((item) => item.row);
    const inventoryRows = snapshot.records;
    const prepared = mainRows.filter((row) => text(row[MAIN.action]) === '备货');
    const returns = mainRows.filter((row) => text(row[MAIN.action]) === '退回维修');
    const shipped = mainRows.filter((row) => text(row[MAIN.action]) === '出库');
    const operationalRows = currentOperationalEntries(main).map(({ row, ledgerRow }) => toOperationalLedgerRow(row, ledgerRow));
    const tasks = deriveTodayTasks(operationalRows, asOf);
    const rawInventory = locationRecordsFromCandidates(inventoryRows);
    const inventorySummary = summarizeLocations(rawInventory);
    const dashboardExceptions = [
      ...deriveLedgerExceptions(operationalRows, validLocations),
      ...inventoryIssuesToOperationalExceptions(inventorySummary.issues),
      ...detectContainerMismatches(rawInventory),
    ];
    const exceptionCounts = new Map<string, number>();
    for (const item of dashboardExceptions) exceptionCounts.set(item.code, (exceptionCounts.get(item.code) ?? 0) + 1);
    const byModel = new Map<string, number>();
    const byLocation = new Map<string, number>();
    for (const item of inventoryRows) {
      const key = `${item.displayName??item.model??''}\u0000${item.condition}`;
      byModel.set(key, (byModel.get(key) ?? 0) + item.availableQty);
      byLocation.set(item.location, (byLocation.get(item.location) ?? 0) + item.availableQty);
    }
    const conditionTotal = (condition: StockCondition) => inventoryRows
      .filter((item) => item.condition === condition)
      .reduce((sum, item) => sum + item.availableQty, 0);
    const newUnits = conditionTotal('新机');
    const repairedGood = conditionTotal('维修良品');
    const pendingRepair = conditionTotal('待修');
    return {
      businessDate: asOf,
      metrics: {
        todayPreparedWorkOrders: new Set(prepared.filter((row) => businessDate(row[MAIN.date]) === asOf).map((row) => text(row[MAIN.sh])).filter(Boolean)).size,
        awaitingPreparation: null,
        awaitingPickup: tasks.awaitingPickup.length,
        shippedToday: tasks.todayOutbound.length,
        returnedToday: tasks.todayReturns.reduce((sum, task) => sum + task.details.reduce((qty, detail) => qty + (detail.qty ?? 0), 0), 0),
        exceptionCount: [...exceptionCounts.values()].reduce((sum, count) => sum + count, 0),
      },
      inventory: {
        newUnits,
        repairedGood,
        pendingRepair,
        repairInventory: repairedGood + pendingRepair,
        scrapped: conditionTotal('报废'),
      },
      inventoryByModel: [...byModel.entries()]
        .map(([key, availableQty]) => {
          const [model = '', condition = ''] = key.split('\u0000');
          return { model, condition, availableQty };
        })
        .sort((left, right) => right.availableQty - left.availableQty || left.model.localeCompare(right.model))
        .slice(0, 12),
      inventoryByLocation: [...byLocation.entries()]
        .map(([location, availableQty]) => ({ location, availableQty }))
        .sort((left, right) => right.availableQty - left.availableQty || left.location.localeCompare(right.location)),
      inventoryByCondition: STOCK_CONDITIONS.map((condition) => ({ condition, availableQty: conditionTotal(condition) })),
      activityBreakdowns: {
        thisWeekShippedQty: qtyForPeriod(shipped, MAIN.outboundDate, asOf, 'week'),
        thisWeekReturnedQty: qtyForPeriod(returns, MAIN.date, asOf, 'week'),
        thisMonthShippedQty: qtyForPeriod(shipped, MAIN.outboundDate, asOf, 'month'),
      },
      metricGrains: {
        todayPreparedWorkOrders: 'SH_COUNT', awaitingPreparation: 'UNAVAILABLE',
        awaitingPickup: 'TASK_COUNT', shippedToday: 'TASK_COUNT', returnedToday: 'QTY',
        exceptionCount: 'ISSUE_COUNT', newUnits: 'QTY', repairedGood: 'QTY',
        pendingRepair: 'QTY', repairInventory: 'QTY', scrapped: 'QTY',
        thisWeekShipped: 'QTY', thisWeekReturned: 'QTY', thisMonthShipped: 'QTY',
      },
      recentPrepared: prepared.slice(-6).reverse().map((row) => ({
        businessDate: businessDate(row[MAIN.date]),
        sh: text(row[MAIN.sh]),
        sku: text(row[MAIN.sku]),
        qty: sourceNumberOrNull(row[MAIN.qty]),
        location: text(row[MAIN.fromLocation]),
        pickupCode: text(row[MAIN.pickup]),
      })),
      recentReturns: returns.slice(-6).reverse().map((row) => ({
        businessDate: businessDate(row[MAIN.date]),
        sku: text(row[MAIN.sku]),
        qty: sourceNumberOrNull(row[MAIN.qty]),
        location: text(row[MAIN.toLocation]),
      })),
      exceptions: [...exceptionCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      notes: [
        '待备货在现有流水中没有独立的预录状态，因此显示为不可用；未新增人工 Status 列。',
        '待取货按 Pickup Code（缺失时按 SH）计为任务；同一任务的多 SKU 行只计一次，后续匹配出库会抵消对应 SKU 数量。',
        '待取货是派生指标；若历史出库缺少 Pickup Code 且 SH 被重复使用，SH 回退匹配需要人工复核。',
        '维修库存按当前库存中的“维修良品 + 待修”实时派生。',
      ],
    };
  }

  async findProduct(sku: string): Promise<ProductRecord | undefined> {
    const table = await this.reader.readTable({
      sheetName: '产品库存维护',
    });
    const skuIndex = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
    const modelIndex = columnIndex(table, ['Model', '机型', '型号']);
    const row = table.data.find((item) => text(item[skuIndex]) === sku);
    return row ? { sku, displayName: text(row[modelIndex]) } : undefined;
  }

  async findAvailableInventory(
    sku: string,
    stockCondition: InventoryCandidate['condition'],
    qty: number,
  ): Promise<InventoryCandidate[]> {
    void qty;
    return (await this.currentInventorySnapshot()).records.filter((item) =>
      item.sku === sku && item.condition === stockCondition && item.availableQty > 0);
  }

  async readPickupCodes(): Promise<string[]> {
    return (await this.readMain()).data.slice(1).map((row) => text(row[MAIN.pickup])).filter(Boolean);
  }

  async findCurrentSerializedInventory(rawSn: string): Promise<CurrentSerializedInventory | undefined> {
    const sn = normalizeSn(rawSn);
    const snapshot = await this.currentInventorySnapshot();
    return currentSerializedFromState(sn, snapshot.serializedStates.get(canonicalizeSn(sn)));
  }

  async findCurrentSerializedInventoryBatch(rawSns: string[]): Promise<CurrentSerializedInventory[]> {
    const snapshot = await this.currentInventorySnapshot();
    return [...new Set(rawSns.map(normalizeSn).filter(Boolean))].flatMap((sn) => {
      const current = currentSerializedFromState(sn, snapshot.serializedStates.get(canonicalizeSn(sn)));
      return current ? [current] : [];
    });
  }

  async findPreparedByReference(reference: string, rawSn: string): Promise<PreparedTransaction | undefined> {
    const normalizedReference = reference.trim().toUpperCase();
    const sn = normalizeSn(rawSn);
    const rows = currentOperationalEntries(await this.readMain()).map((item) => item.row).filter((row) => text(row[MAIN.action]) === '备货'
      && [text(row[MAIN.pickup]), text(row[MAIN.sh])].some((value) => value.toUpperCase() === normalizedReference));
    const exact = rows.find((row) => normalizeSn(text(row[MAIN.sn])) === sn) ?? (rows.length === 1 ? rows[0] : undefined);
    if (!exact) return undefined;
    const condition = text(exact[MAIN.stockCondition]) as StockCondition;
    if (!STOCK_CONDITIONS.includes(condition)) return undefined;
    return { shNo: text(exact[MAIN.sh]), pickupCode: text(exact[MAIN.pickup]), sku: text(exact[MAIN.sku]),
      location: text(exact[MAIN.fromLocation]), erpWarehouse: text(exact[MAIN.erpWarehouse]), stockCondition: condition,
      ...(text(exact[MAIN.container]) ? { containerCode: text(exact[MAIN.container]) } : {}) };
  }

  async findReversibleOutboundBySh(rawShNo: string): Promise<OutboundTransaction[]> {
    const shNo = rawShNo.trim().toUpperCase();
    const rows = currentOperationalEntries(await this.readMain());
    const reversedRows = new Set(rows
      .filter(({ row }) => text(row[MAIN.action]) === '库存调增')
      .map(({ row }) => reversedOutboundLedgerRow(text(row[MAIN.remark])))
      .filter((row): row is number => row !== undefined));
    return rows.flatMap(({ row, ledgerRow }): OutboundTransaction[] => {
      if (reversedRows.has(ledgerRow) || text(row[MAIN.action]) !== '出库' || text(row[MAIN.sh]).toUpperCase() !== shNo) return [];
      const condition = text(row[MAIN.stockCondition]) as StockCondition;
      const qty = parseSourceNumber(row[MAIN.qty]);
      const sku = text(row[MAIN.sku]);
      const fromLocation = text(row[MAIN.fromLocation]);
      if (!sku || !fromLocation || qty.kind !== 'valid' || qty.value <= 0 || !STOCK_CONDITIONS.includes(condition)) return [];
      const item: OutboundTransaction = {
        ledgerRow, outboundDate: businessDate(row[MAIN.outboundDate]), shNo: text(row[MAIN.sh]), sku,
        qty: qty.value, fromLocation, stockCondition: condition,
      };
      if (text(row[MAIN.pickup])) item.pickupCode = text(row[MAIN.pickup]);
      if (text(row[MAIN.container])) item.containerCode = text(row[MAIN.container]);
      if (text(row[MAIN.sn])) item.sn = normalizeSn(text(row[MAIN.sn]));
      if (text(row[MAIN.erpWarehouse])) item.erpWarehouse = text(row[MAIN.erpWarehouse]);
      return [item];
    });
  }

  async readTodayTasks(asOf: BusinessDate): Promise<TodayTaskSnapshot> {
    const rows = currentOperationalEntries(await this.readMain())
      .map(({ row, ledgerRow }) => toOperationalLedgerRow(row, ledgerRow));
    return deriveTodayTasks(rows, asOf);
  }

  async readOperationsBootstrap(asOf: BusinessDate): Promise<OperationsBootstrap> {
    const started = Date.now();
    const [main, inventory, validLocations] = await Promise.all([this.readMain(), this.readInventory(), this.readValidLocations()]);
    const readMs = Date.now() - started;
    const sourceType = this.config.currentInventoryAuthorityMode ?? 'UNKNOWN';
    const effectiveAt = this.config.currentInventoryBaselineEffectiveAt ?? '';
    assertAuthoritativeBaseline(sourceType, effectiveAt);
    const ledgerRecords = main.data.slice(1).map((row, index) => toMovementLedgerRecord(row, index + 2)).filter((record) => record.action);
    const snapshot = CURRENT_INVENTORY_PROJECTOR.project({ sourceType, effectiveAt, records: parseInventoryRecords(inventory).records }, MOVEMENT_PROJECTOR.projectLedgerRecords(ledgerRecords).movements);
    const summary = summarizeLocations(locationRecordsFromCandidates(snapshot.records));
    const byLocation = new Map(summary.summaries.map((item) => [item.location, item]));
    const locations = [...validLocations].sort((left, right) => left.localeCompare(right)).map((location) => {
      const item = byLocation.get(location) ?? { location, totalQty: 0, skuLines: [], containers: [] };
      return { ...item, displayText: formatLocationSummary(location, item) };
    });
    const tasks = deriveTodayTasks(currentOperationalEntries(main).map(({ row, ledgerRow }) => toOperationalLedgerRow(row, ledgerRow)), asOf);
    console.info(JSON.stringify({ diagnostic: 'OPERATIONS_BOOTSTRAP', readMs, projectionMs: Date.now() - started - readMs, locationCount: locations.length, pickupCount: tasks.awaitingPickup.length }));
    return { locations, awaitingPickup: tasks.awaitingPickup };
  }

  async readLocationSummaries(): Promise<{ locations: Array<LocationSummary & { displayText: string }>; issues: ReturnType<typeof summarizeLocations>['issues'] }> {
    const [snapshot, validLocations] = await Promise.all([this.currentInventorySnapshot(), this.readValidLocations()]);
    const result = summarizeLocations(locationRecordsFromCandidates(snapshot.records));
    const byLocation = new Map(result.summaries.map((summary) => [summary.location, summary]));
    const locations = [...validLocations].sort((left, right) => left.localeCompare(right));
    return {
      locations: locations.map((location) => {
        const summary = byLocation.get(location) ?? { location, totalQty: 0, skuLines: [], containers: [] };
        return { ...summary, displayText: formatLocationSummary(location, summary) };
      }),
      issues: result.issues,
    };
  }

  async readOperationalExceptions(): Promise<{ exceptions: OperationalException[]; supportedCodes: readonly string[] }> {
    const [main, snapshot, validLocations] = await Promise.all([this.readMain(), this.currentInventorySnapshot(), this.readValidLocations()]);
    const inventory = locationRecordsFromCandidates(snapshot.records);
    const rows = currentOperationalEntries(main).map(({ row, ledgerRow }) => toOperationalLedgerRow(row, ledgerRow));
    const summary = summarizeLocations(inventory);
    const exceptions = [
      ...deriveLedgerExceptions(rows, validLocations),
      ...inventoryIssuesToOperationalExceptions(summary.issues),
      ...detectContainerMismatches(inventory),
    ];
    return { exceptions, supportedCodes: LIVE_OPERATIONAL_EXCEPTION_CODES };
  }

  async readWeeklyReport(asOf: BusinessDate): Promise<WeeklyWarehouseReport> {
    const [main, inventory, manual] = await Promise.all([this.readMain(), this.readInventory(), this.readWeeklyManualMetrics(asOf)]);
    const rows = main.data.slice(1).filter(row => text(row[MAIN.action])).map((row, index) => toOperationalLedgerRow(row, index + 2));
    return deriveWeeklyWarehouseReport(rows, parseInventoryRecords(inventory).records, asOf, manual);
  }

  private async readWeeklyManualMetrics(asOf: BusinessDate): Promise<WeeklyManualMetrics> {
    try {
      const table = await this.reader.readTable({ sheetName: '维修周数据录入', noHeader: true, range: 'A1:M201' });
      const start = mondayOf(asOf);
      const row = table.data.find(item => businessDate(item[0]) === start);
      if (!row) return {};
      const metric = (index: number) => { const parsed=parseSourceNumber(row[index]); return parsed.kind==='valid'?parsed.value:undefined; };
      return {
        ...(metric(2)!==undefined?{returnedForRepair:metric(2)!}:{}), ...(metric(3)!==undefined?{repairCompleted:metric(3)!}:{}),
        ...(metric(4)!==undefined?{repairScrapped:metric(4)!}:{}), ...(metric(5)!==undefined?{repairedGoodShipped:metric(5)!}:{}),
        ...(metric(6)!==undefined?{scrapOutbound:metric(6)!}:{}), ...(metric(7)!==undefined?{pendingScrap:metric(7)!}:{}),
        ...(metric(8)!==undefined?{repairedGoodInbound:metric(8)!}:{}), ...(metric(9)!==undefined?{currentPendingRepair:metric(9)!}:{}),
        ...(metric(10)!==undefined?{currentRepairedGood:metric(10)!}:{}), ...(text(row[12])?{note:text(row[12])}:{}),
      };
    } catch { return {}; }
  }

  async readSnResolverContext(sns: readonly string[]): Promise<SnResolverContext> {
    const [main, products, snapshot] = await Promise.all([
      this.readMain(),
      this.reader.readTable({ sheetName: '产品库存维护' }),
      this.currentInventorySnapshot(),
    ]);
    const requested = new Set(sns.map(normalizeSn));
    const requestedCanonical = new Set(sns.map(canonicalizeSn));
    const ledgerRows = main.data.slice(1).map((row, index) => ({ row, index }))
      .filter(({ row }) => requestedCanonical.has(canonicalizeSn(text(row[MAIN.sn]))));
    const byCanonical = new Map<string, typeof ledgerRows>();
    for (const item of ledgerRows) {
      const canonicalSn = canonicalizeSn(text(item.row[MAIN.sn]));
      byCanonical.set(canonicalSn, [...(byCanonical.get(canonicalSn) ?? []), item]);
    }
    const verifiedMappings: VerifiedSnMapping[] = [];
    const operationalStates: SnOperationalState[] = [];
    for (const sn of requested) {
      const canonicalSn = canonicalizeSn(sn);
      const history = byCanonical.get(canonicalSn) ?? [];
      const materials = [...new Set(history.map(({ row }) => text(row[MAIN.sku])).filter(Boolean))];
      if (materials.length === 1) {
        const latestWithMaterial = history.filter(({row})=>text(row[MAIN.sku])===materials[0]).sort((left,right)=>
          businessDate(right.row[MAIN.date]).localeCompare(businessDate(left.row[MAIN.date]))||right.index-left.index)[0];
        verifiedMappings.push({
          sn: latestWithMaterial ? normalizeSn(text(latestWithMaterial.row[MAIN.sn])) : sn,
          canonicalSn, materialCode: materials[0]!,
          ...(latestWithMaterial && text(latestWithMaterial.row[MAIN.model]) ? { model: text(latestWithMaterial.row[MAIN.model]) } : {}),
          verified: true, source: 'LEDGER', createdAt: latestWithMaterial ? businessDate(latestWithMaterial.row[MAIN.date]) : '',
        });
      }
      const current = snapshot.serializedStates.get(canonicalSn);
      operationalStates.push({ sn, currentState: current ? legacyOperationalState(current) : 'UNKNOWN', previouslyOutbound: current?.status === 'OUTBOUND',
        reason: current ? 'Authoritative baseline plus SYSTEM_NATIVE replay.' : 'No authoritative serialized current state was found.' });
    }
    const skuIndex = columnIndex(products, ['SKU', '料号', '物料号', '产品料号']);
    const modelIndex = optionalColumnIndex(products, ['Model', '机型', '型号']);
    const materialOptions: MaterialOption[] = products.data.map((row) => ({
      materialCode: text(row[skuIndex]), ...(modelIndex !== undefined && text(row[modelIndex]) ? { model: text(row[modelIndex]) } : {}),
    })).filter((item) => item.materialCode);
    return { verifiedMappings, operationalStates, materialOptions };
  }

  private readMain(): Promise<TypedSheetData> {
    // Deduplicate overlapping projections within one request. This is not a
    // cross-request cache: the promise is cleared as soon as it settles.
    if (this.mainReadInFlight) return this.mainReadInFlight;
    this.mainReadInFlight = this.reader.readTable({
      sheetId: this.config.mainSheetId,
      noHeader: true,
    });
    void this.mainReadInFlight.finally(() => { this.mainReadInFlight = undefined; });
    return this.mainReadInFlight;
  }

  private readInventory(): Promise<TypedSheetData> {
    return this.reader.readTable({
      sheetId: this.config.currentInventorySheetId,
    });
  }

  private async currentInventorySnapshot() {
    const sourceType = this.config.currentInventoryAuthorityMode ?? 'UNKNOWN';
    const effectiveAt = this.config.currentInventoryBaselineEffectiveAt ?? '';
    assertAuthoritativeBaseline(sourceType, effectiveAt);
    const [inventory, records] = await Promise.all([this.readInventory(), this.readLedgerRecords()]);
    const baselineVerification = verifyCurrentInventoryBaseline(inventory, sourceType);
    if (!baselineVerification.valid) throw new Error(baselineVerification.code);
    return CURRENT_INVENTORY_PROJECTOR.project({ sourceType, effectiveAt, records: parseInventoryRecords(inventory).records }, MOVEMENT_PROJECTOR.projectLedgerRecords(records).movements);
  }

  private async readValidLocations(): Promise<Set<string>> {
    const table = await this.reader.readTable({ sheetName: '库位维护' });
    const location = columnIndex(table, ['库位编码（R-排-列-L/M/R）', '库位编码', 'Location']);
    return new Set(table.data.map((row) => text(row[location])).filter(Boolean));
  }
}

export interface OperationsBootstrap {
  locations: Array<LocationSummary & { displayText: string }>;
  awaitingPickup: TodayTaskSnapshot['awaitingPickup'];
}

function currentSerializedFromState(sn: string, state: CurrentSnState | undefined): CurrentSerializedInventory | undefined {
  if (!state || state.status !== 'IN_STOCK') return undefined;
  return { sn: state.sn, sku: state.sku, location: state.location, stockCondition: state.stockCondition, currentState: legacyOperationalState(state) };
}

function currentSerializedFromMovements(sn:string,projected:readonly InventoryMovement[]):CurrentSerializedInventory|undefined{
  const replayed=new DeterministicSnLifecycleReplayService().replay(sn,projected),state=replayed.currentState;
  if(state.status==='IN_STOCK'){
    const movement=projected.find(item=>item.movementId===state.lastMovementId);
    return {sn:state.sn,sku:state.sku,location:state.location,stockCondition:state.stockCondition,currentState:legacyOperationalState(state),
      ...(movement?.containerCode?{containerCode:movement.containerCode}:{})};
  }

  if(state.status==='OUTBOUND'){
    const movement=projected.find(item=>item.movementId===state.lastMovementId),condition=movement?.stockConditionBefore;
    if(!state.sku||!movement?.fromLocation||!condition)return undefined;
    return {sn:state.sn,sku:state.sku,location:movement.fromLocation,stockCondition:condition,currentState:'OUTBOUND',...(movement.containerCode?{containerCode:movement.containerCode}:{})};
  }
  return undefined;
}

function legacyOperationalState(state:CurrentSnState,lastLifecycleAction?:string):Exclude<SnOperationalState['currentState'],'NOT_FOUND'>{
  if(lastLifecycleAction==='PREPARE'||lastLifecycleAction==='备货')return 'PREPARED';
  if(state.status==='OUTBOUND')return 'OUTBOUND';if(state.status==='REMOVED'||state.status==='CONFLICT'||state.status==='UNKNOWN')return 'UNKNOWN';
  if(state.stockCondition==='待修')return 'REPAIR';if(state.stockCondition==='报废')return 'SCRAPPED';return 'GOOD';
}

export function warehouseReadAdapterFromEnv(): FeishuWarehouseReadAdapter {
  const config = {
    spreadsheetUrl: process.env.FEISHU_SPREADSHEET_URL?.trim() ?? '',
    mainSheetId: requiredEnv('FEISHU_MAIN_SHEET_ID'),
    currentInventorySheetId: requiredEnv('FEISHU_CURRENT_INVENTORY_SHEET_ID'),
    currentInventoryAuthorityMode: (process.env.CURRENT_INVENTORY_AUTHORITY_MODE?.trim() ?? 'UNKNOWN') as CurrentInventorySourceType,
    currentInventoryBaselineEffectiveAt: process.env.CURRENT_INVENTORY_BASELINE_EFFECTIVE_AT?.trim() ?? '',
  };
  return new FeishuWarehouseReadAdapter(config, warehouseSheetReaderFromEnv());
}

export function parseInventoryRecords(table: TypedSheetData): { records: InventoryCandidate[]; missingQty: number; invalidQty: number } {
  const sku = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
  const model = columnIndex(table, ['Model', '机型', '型号']);
  const location = columnIndex(table, ['Location', '库位', '当前库位', '库位编码']);
  const container = optionalColumnIndex(table, ['Container', '容器', '容器码']);
  const available = columnIndex(table, ['Available Qty', '可用数量', '可用库存', '可用Qty', '当前数量']);
  const condition = columnIndex(table, ['Stock Condition', '库存属性', '属性']);
  const sn = optionalColumnIndex(table, ['SN', '序列号', 'Serial Number']);
  const records: InventoryCandidate[] = [];
  let missingQty = 0;
  let invalidQty = 0;
  for (const row of table.data) {
    const conditionValue = text(row[condition]);
    const locationValue = text(row[location]);
    const skuValue = text(row[sku]);
    const modelValue = text(row[model]);
    if (!skuValue && !modelValue && !locationValue && !conditionValue) continue;
    const parsedQty = parseSourceNumber(row[available]);
    if (parsedQty.kind === 'missing') { missingQty += 1; continue; }
    if (parsedQty.kind === 'invalid') { invalidQty += 1; continue; }
    const availableQty = parsedQty.value;
    if (availableQty < 0) { invalidQty += 1; continue; }
    if (!skuValue || !locationValue || availableQty <= 0 || !STOCK_CONDITIONS.includes(conditionValue as StockCondition)) continue;
    const item: InventoryCandidate = {
      sku: skuValue,
      ...(modelValue ? { displayName: modelValue } : {}),
      location: locationValue,
      availableQty,
      condition: conditionValue as StockCondition,
    };
    const snValue=sn===undefined?'':text(row[sn]);if(snValue)item.sn=snValue;
    const containerValue = container === undefined ? '' : text(row[container]);
    if (containerValue) item.container = containerValue;
    records.push(item);
  }
  return { records, missingQty, invalidQty };
}

function columnIndex(table: TypedSheetData, aliases: string[]): number {
  const index = optionalColumnIndex(table, aliases);
  if (index === undefined) throw new Error(`SYSTEM_READ_FAILED: missing column ${aliases.join('/')}`);
  return index;
}

function optionalColumnIndex(table: TypedSheetData, aliases: string[]): number | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const index = table.columns.findIndex((column) => normalizedAliases.has(normalizeHeader(column)));
  return index >= 0 ? index : undefined;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_()-]/g, '');
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function sourceNumberOrNull(value: unknown): number | null {
  const parsed = parseSourceNumber(value);
  return parsed.kind === 'valid' ? parsed.value : null;
}

export function businessDateFromSheetValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  const source = text(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(source)?.[1];
  if (iso) return iso;
  const au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(source);
  if (au) return `${au[3]}-${au[2]!.padStart(2, '0')}-${au[1]!.padStart(2, '0')}`;
  return '';
}
function businessDate(value: unknown): string { return businessDateFromSheetValue(value); }

function toOperationalLedgerRow(row: TypedSheetData['data'][number], ledgerRow: number): OperationalLedgerRow {
  const qty = parseSourceNumber(row[MAIN.qty]);
  return {
    ledgerRow,
    date: businessDate(row[MAIN.date]), outboundDate: businessDate(row[MAIN.outboundDate]),
    action: text(row[MAIN.action]), sh: text(row[MAIN.sh]), pickupCode: text(row[MAIN.pickup]),
    sku: text(row[MAIN.sku]), model: text(row[MAIN.model]),
    ...(qty.kind === 'valid' ? { qty: qty.value } : {}),
    erpWarehouse: text(row[MAIN.erpWarehouse]), fromLocation: text(row[MAIN.fromLocation]),
    toLocation: text(row[MAIN.toLocation]), container: text(row[MAIN.container]),
    sn: text(row[MAIN.sn]), stockCondition: text(row[MAIN.stockCondition]), remark: text(row[MAIN.remark]),
  };
}

function rawInventoryRecords(table: TypedSheetData): Array<LocationInventoryRecord & { sourceRow?: number }> {
  const sourceRow = optionalColumnIndex(table, ['来源行']);
  const location = columnIndex(table, ['Location', '库位', '当前库位', '库位编码']);
  const container = optionalColumnIndex(table, ['Container', '容器', '容器码']);
  const sku = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
  const qty = columnIndex(table, ['Available Qty', '可用数量', '可用库存', '可用Qty', '当前数量']);
  const records: Array<LocationInventoryRecord & { sourceRow?: number }> = [];
  for (const row of table.data) {
    const locationValue = text(row[location]);
    const skuValue = text(row[sku]);
    const qtyValue = row[qty];
    if (!locationValue && !skuValue && (qtyValue === null || qtyValue === '')) continue;
    const record: LocationInventoryRecord & { sourceRow?: number } = {
      location: locationValue, sku: skuValue, qty: qtyValue,
    };
    const containerValue = container === undefined ? '' : text(row[container]);
    if (containerValue) record.container = containerValue;
    const source = sourceRow === undefined ? undefined : Number(row[sourceRow]);
    if (source !== undefined && Number.isInteger(source) && source > 0) record.sourceRow = source;
    records.push(record);
  }
  return records;
}

function qtyForPeriod(
  rows: TypedSheetData['data'], dateColumn: number, asOf: BusinessDate, period: 'week' | 'month',
): number {
  const start = period === 'month' ? `${asOf.slice(0, 7)}-01` : mondayOf(asOf);
  return rows.filter((row) => {
    const date = businessDate(row[dateColumn]);
    return date >= start && date <= asOf;
  }).reduce((sum, row) => {
    const qty = parseSourceNumber(row[MAIN.qty]);
    return sum + (qty.kind === 'valid' ? qty.value : 0);
  }, 0);
}

function mondayOf(date: BusinessDate): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

function locationRecordsFromCandidates(items: readonly InventoryCandidate[]): LocationInventoryRecord[] {
  return items.map((item) => ({ location: item.location, sku: item.sku, qty: item.availableQty, ...(item.container ? { container: item.container } : {}) }));
}

function toMovementLedgerRecord(row:TypedSheetData['data'][number],sourceSequence:number):OperationalLedgerRecord{
  const qty=parseSourceNumber(row[MAIN.qty]),remark=text(row[MAIN.remark]);
  const systemMarker=parseSystemLedgerMarker(remark);
  const sourceRecordIdentifier=systemMarker.movementId;
  const transactionGroupId=/\bTXG-[^;\s]+\b/.exec(remark)?.[0];
  const origin=sourceRecordIdentifier?'SYSTEM_NATIVE':/\[(?:LEGACY_MIGRATION|历史追踪\|不计实时库存)\]/i.test(remark)?'LEGACY_MIGRATION':/Import reference:/i.test(remark)?'MANUAL_IMPORT':'LEGACY_MIGRATION';
  const condition=text(row[MAIN.stockCondition]);
  const record:OperationalLedgerRecord={sourceRecordRef:{sourceSystem:'FEISHU_LEDGER',sourceType:'OPERATIONAL_LEDGER',internalRecordKey:`ledger-row:${sourceSequence}`},sourceSequence,
    sourceBatch:origin==='SYSTEM_NATIVE'?'SYSTEM_NATIVE':origin,origin,
    businessDate:businessDate(row[MAIN.date]),action:text(row[MAIN.action]),...(qty.kind==='valid'?{qty:qty.value}:{}),...(sourceRecordIdentifier?{sourceRecordIdentifier}:{}),...(systemMarker.createdAt?{createdAt:systemMarker.createdAt}:{}),...(systemMarker.createdBy?{createdBy:systemMarker.createdBy}:{}),...(transactionGroupId?{transactionGroupId}:{}),
    ...(businessDate(row[MAIN.outboundDate])?{actualOutboundDate:businessDate(row[MAIN.outboundDate])}:{}),...(text(row[MAIN.sku])?{sku:text(row[MAIN.sku])}:{}),
    ...(text(row[MAIN.model])?{displayName:text(row[MAIN.model])}:{}),...(text(row[MAIN.sn])?{sn:text(row[MAIN.sn])}:{}),...(text(row[MAIN.fromLocation])?{fromLocation:text(row[MAIN.fromLocation])}:{}),
    ...(text(row[MAIN.toLocation])?{toLocation:text(row[MAIN.toLocation])}:{}),...(text(row[MAIN.container])?{containerCode:text(row[MAIN.container])}:{}),
    ...(text(row[MAIN.erpWarehouse])?{erpWarehouse:text(row[MAIN.erpWarehouse])}:{}),...(text(row[MAIN.sh])?{shNo:text(row[MAIN.sh])}:{}),...(text(row[MAIN.pickup])?{pickupCode:text(row[MAIN.pickup])}:{}),...(remark?{remark,reason:remark}:{}),
  };
  if(STOCK_CONDITIONS.includes(condition as StockCondition))record.stockCondition=condition as StockCondition;
  return record;
}

/** A legacy row remains available through audit/history reads but is excluded
 * from every live operational projection (tasks, dashboard and exceptions). */
function currentOperationalEntries(table: TypedSheetData): Array<{ row: TypedSheetData['data'][number]; ledgerRow: number }> {
  return table.data.slice(1).flatMap((row, index) => {
    if (!text(row[MAIN.action])) return [];
    const ledgerRow = index + 2;
    const eligibility = MOVEMENT_PROJECTOR.projectLedgerRecord(toMovementLedgerRecord(row, ledgerRow)).replayEligibility;
    return eligibility === 'CURRENT_STATE' || eligibility === 'MIGRATION_BASELINE' ? [{ row, ledgerRow }] : [];
  });
}

function movementRecordMatches(record:OperationalLedgerRecord,query:MovementQuery):boolean{
  return (!query.sn||canonicalizeSn(record.sn??'')===canonicalizeSn(query.sn))&&(!query.sku||record.sku?.toUpperCase()===query.sku.toUpperCase())
    &&(!query.shNo||record.shNo?.toUpperCase()===query.shNo.toUpperCase())&&(!query.fromDate||record.businessDate>=query.fromDate)&&(!query.toDate||record.businessDate<=query.toDate)
    &&(!query.location||record.fromLocation===query.location||record.toLocation===query.location);
}
