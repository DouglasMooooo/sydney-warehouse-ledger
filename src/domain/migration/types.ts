import type { StockCondition } from '../../config/controlledValues.js';
import type { InventoryMovement } from '../movement/types.js';

export type BaselineEvidenceSource='PHYSICAL_SN'|'CURRENT_INVENTORY_PROJECTION'|'OPERATIONAL_LEDGER'|'PRODUCT_MASTER'|'MANUAL_REVIEW';
export type EvidenceAuthority='CURRENT_DIRECT'|'CURRENT_AGGREGATE'|'REFERENCE'|'HISTORICAL';
export type CurrentEvidenceScope='SN_EXACT'|'AGGREGATE_BUCKET'|'NONE';
export type BaselineConfidence='HIGH'|'MEDIUM'|'LOW'|'CONFLICT';
export type BaselineVerificationStatus='VERIFIED'|'REVIEW_REQUIRED'|'CONFLICT';
export type BaselineCandidateStatus='READY'|'MISSING_SKU'|'MISSING_LOCATION'|'INVALID_CONDITION'|'SKU_CONFLICT'|'LOCATION_CONFLICT'|'CONDITION_CONFLICT'|'DUPLICATE_SN'|'NO_CURRENT_EVIDENCE'|'LEGACY_ONLY'|'MANUAL_REVIEW';
export type BaselineWarningCode='HISTORICAL_SKU_MISMATCH'|'HISTORICAL_LOCATION_MISMATCH'|'HISTORICAL_CONDITION_MISMATCH';
export type PhysicalEvidenceQuality='VALID'|'PARTIAL'|'INVALID';

export interface BaselineEvidence {source:BaselineEvidenceSource;authority:EvidenceAuthority;field:'SN'|'SKU'|'DISPLAY_NAME'|'LOCATION'|'STOCK_CONDITION'|'CURRENT_STATE';value:string;confidence:Exclude<BaselineConfidence,'CONFLICT'>}
export interface MigrationBaselineRecord {baselineId:string;sn:string;canonicalSn:string;sku:string;displayName?:string;location:string;stockCondition:StockCondition;baselineDate:string;evidence:BaselineEvidence[];verificationStatus:BaselineVerificationStatus;reviewIssues:BaselineCandidateStatus[]}
export interface MigrationBaselineCandidate extends Omit<MigrationBaselineRecord,'stockCondition'>{stockCondition:StockCondition|string;confidence:BaselineConfidence;candidateStatus:BaselineCandidateStatus;physicalEvidenceQuality:PhysicalEvidenceQuality;currentEvidenceScope:CurrentEvidenceScope;blockingIssues:BaselineCandidateStatus[];warnings:BaselineWarningCode[];candidateOnly:true}

export interface PhysicalSnSource {sn:string;sku?:string;location?:string;stockCondition?:string;sourceRef?:string}
export interface CurrentInventorySnSource {sn:string;sku:string;location:string;stockCondition:string;displayName?:string;evidenceScope?:'SN_EXACT'|'AGGREGATE_BUCKET'}
export interface ProductMasterSource {sku:string;displayName?:string}
export interface BaselineCandidateInput {baselineDate:string;physical:readonly PhysicalSnSource[];currentInventory:readonly CurrentInventorySnSource[];ledger:readonly import('../movement/types.js').OperationalLedgerRecord[];products:readonly ProductMasterSource[]}
export interface BaselineCandidateService {build():Promise<MigrationBaselineCandidate[]>}

export interface CutoverPolicy {cutoverDate:string;preCutoverMode:'HISTORICAL_EVIDENCE_ONLY';baselineMode:'MIGRATION_BASELINE';postCutoverMode:'CURRENT_STATE';sameDayBoundary:'BASELINE_AT_START_POST_CUTOVER_AFTER_DATE'}
export interface CandidateCutoverDate {date:string;basis:'PHYSICAL_SNAPSHOT'|'MIGRATION_COMPLETION'|'FIRST_RELIABLE_SYSTEM_NATIVE';dataCompleteness:'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN';movementContinuity:'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN';currentStockCoverage:'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN';recommended:boolean;risk:string}

export interface MigrationManifest {migrationId:string;cutoverDate:string;createdAt:string;sourceSummary:{physicalCount:number;currentProjectionCount:number;ledgerRecordCount:number};baselineCount:number;verifiedCount:number;reviewRequiredCount:number;conflictCount:number;approvalStatus:'DRAFT'|'REVIEWED'|'APPROVED';approvedBy?:string;approvedAt?:string}

export interface BaselineReplaySimulationInput {candidates:readonly MigrationBaselineCandidate[];movements:readonly InventoryMovement[];policy:CutoverPolicy;physicalTarget:readonly PhysicalSnSource[]}
export interface BaselineSimulationMetrics {replayInStock:number;matched:number;rawMatchRate:number;validEvidenceOnlyMatchRate:number;replayConflicts:number}
export interface BaselineReplaySimulationReport {baselineCandidates:number;verifiedCandidates:number;reviewRequired:number;candidateConflicts:number;postCutoverMovements:number;simulationScope:'BASELINE_ONLY'|'BASELINE_PLUS_POST_CUTOVER';strict:BaselineSimulationMetrics;permissive:BaselineSimulationMetrics;orderingRiskMovementCount:number;historicalEvidenceCount:number}
