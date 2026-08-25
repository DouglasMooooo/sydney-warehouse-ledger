import { createHash } from 'node:crypto';
import type { InventoryMovement, MovementIdentityAuthority, OperationalLedgerRecord } from './types.js';

export function systemMovementId(businessDate: string, sequence: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !Number.isInteger(sequence) || sequence <= 0) throw new TypeError('INVALID_MOVEMENT_ID_INPUT');
  return `MOV-${businessDate.replaceAll('-','')}-${String(sequence).padStart(6,'0')}`;
}

export function legacyMovementId(record: OperationalLedgerRecord, related: readonly OperationalLedgerRecord[] = []): string {
  return hashedMovementId('LEGACY',record,related);
}

export function derivedMovementId(record: OperationalLedgerRecord, related: readonly OperationalLedgerRecord[] = []): string {
  return hashedMovementId('DERIVED',record,related);
}

function hashedMovementId(prefix:'DERIVED'|'LEGACY',record: OperationalLedgerRecord, related: readonly OperationalLedgerRecord[]): string {
  const records=[record,...related].map(stableIdentityFields).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `${prefix}-${createHash('sha256').update(JSON.stringify(records)).digest('hex').slice(0,20).toUpperCase()}`;
}

export function projectedMovementId(record: OperationalLedgerRecord, related: readonly OperationalLedgerRecord[] = []): string {
  if (record.origin === 'SYSTEM_NATIVE' && record.sourceRecordIdentifier?.match(/^MOV-\d{8}-\d{6}$/)) return record.sourceRecordIdentifier;
  if(record.origin==='LEGACY_MIGRATION')return legacyMovementId(record,related);
  return derivedMovementId(record,related);
}

export function movementIdentityAuthority(record:OperationalLedgerRecord):MovementIdentityAuthority{
  if(record.origin==='SYSTEM_NATIVE'&&/^MOV-\d{8}-\d{6}$/.test(record.sourceRecordIdentifier??''))return 'PERSISTED';
  return record.origin==='LEGACY_MIGRATION'?'LEGACY':'DERIVED';
}

export function correlationIdFor(input: Pick<InventoryMovement,'movementId'|'ledgerAction'|'shNo'|'sn'|'businessDate'|'transactionGroupId'|'correlationId'>): string {
  if(input.transactionGroupId)return input.transactionGroupId;
  if(input.correlationId)return input.correlationId;
  const sh=input.shNo?.trim().toUpperCase();
  if(sh?.startsWith('SH-'))return `CORR-SH-${sh.slice(3)}`;
  if(input.ledgerAction==='退回维修'&&input.sn)return `CORR-RET-${safePart(input.sn)}-${input.businessDate.replaceAll('-','')}`;
  if(input.ledgerAction==='移库')return `CORR-MOVE-${input.movementId}`;
  return `CORR-${input.movementId}`;
}

function stableIdentityFields(record: OperationalLedgerRecord) {
  return { origin:record.origin,sourceBatch:record.sourceBatch??'',sourceRecordIdentifier:record.sourceRecordIdentifier??'',transactionGroupId:record.transactionGroupId??'',businessDate:record.businessDate,
    actualOutboundDate:record.actualOutboundDate??'',action:record.action,sn:record.sn??'',sku:record.sku??'',shNo:record.shNo??'',pickupCode:record.pickupCode??'',
    qty:record.qty??null,fromLocation:record.fromLocation??'',toLocation:record.toLocation??'',stockCondition:record.stockCondition??'',reason:record.reason??'',remark:record.remark??'' };
}
function safePart(value:string){return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');}
