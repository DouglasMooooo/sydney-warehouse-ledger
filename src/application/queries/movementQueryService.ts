import type { InventoryMovement, MovementValidationIssue, OperationalLedgerRecord } from '../../domain/movement/types.js';
import { DeterministicMovementProjectionService, type MovementProjectionService } from '../../domain/movement/movementProjection.js';
import { canonicalizeSn } from '../../snResolver/resolver.js';

export interface MovementQuery { movementId?:string;sn?:string;sku?:string;shNo?:string;action?:string;fromDate?:string;toDate?:string;location?:string }
export type MovementDetail=Omit<InventoryMovement,'sourceRecordRef'|'sourceSequence'>;
export interface MovementQueryResult { capabilityState:'AVAILABLE';items:MovementDetail[];issues:MovementValidationIssue[] }
export interface MovementQueryService {search(query:MovementQuery):Promise<MovementQueryResult>;getById(movementId:string):Promise<MovementDetail|null>}
export interface MovementReadPort {readLedgerRecords(query?:MovementQuery):Promise<OperationalLedgerRecord[]>}
export interface MovementRepository {search(query:MovementQuery):Promise<{movements:InventoryMovement[];issues:MovementValidationIssue[]}>;getById(movementId:string):Promise<InventoryMovement|null>}

export class ProjectedMovementRepository implements MovementRepository {
  constructor(private readonly port:MovementReadPort,private readonly projector:MovementProjectionService=new DeterministicMovementProjectionService()){}
  async search(query:MovementQuery){const projection=this.projector.projectLedgerRecords(await this.port.readLedgerRecords(query));return {movements:projection.movements.filter(item=>matches(item,query)),issues:projection.issues};}
  async getById(movementId:string){const result=await this.search({movementId});return result.movements.find(item=>item.movementId===movementId)??null;}
}
export class LiveMovementQueryService implements MovementQueryService {
  constructor(private readonly repository:MovementRepository){}
  async search(query:MovementQuery):Promise<MovementQueryResult>{validateQuery(query);const result=await this.repository.search(query);return {capabilityState:'AVAILABLE',items:result.movements.map(toDetail),issues:result.issues};}
  async getById(movementId:string):Promise<MovementDetail|null>{if(!/^(?:MOV-\d{8}-\d{6}|(?:DERIVED|LEGACY)-[A-F0-9]{20})$/.test(movementId))throw new TypeError('INVALID_MOVEMENT_ID');const item=await this.repository.getById(movementId);return item?toDetail(item):null;}
}
function toDetail(item:InventoryMovement):MovementDetail{const {sourceRecordRef:_ref,sourceSequence:_sequence,...detail}=item;return detail;}
function matches(item:InventoryMovement,q:MovementQuery){return (!q.movementId||item.movementId===q.movementId)&&(!q.sn||canonicalizeSn(item.sn??'')===canonicalizeSn(q.sn))&&(!q.sku||item.sku?.toUpperCase()===q.sku.toUpperCase())
  &&(!q.shNo||item.shNo?.toUpperCase()===q.shNo.toUpperCase())&&(!q.action||(item.workflow??item.ledgerAction)===q.action)&&(!q.fromDate||item.businessDate>=q.fromDate)&&(!q.toDate||item.businessDate<=q.toDate)
  &&(!q.location||item.fromLocation===q.location||item.toLocation===q.location);}
function validateQuery(query:MovementQuery){for(const value of Object.values(query))if(value&&value.length>160)throw new TypeError('INVALID_MOVEMENT_QUERY');if(query.fromDate&&!/^\d{4}-\d{2}-\d{2}$/.test(query.fromDate))throw new TypeError('INVALID_FROM_DATE');if(query.toDate&&!/^\d{4}-\d{2}-\d{2}$/.test(query.toDate))throw new TypeError('INVALID_TO_DATE');}
