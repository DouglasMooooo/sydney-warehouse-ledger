# ADR: Movement Identity Persistence

Status: Proposed. This phase changes no production spreadsheet schema.

## Context

Movement identity has three explicit authority levels:

- `MOV-*`: persisted, authoritative system identity.
- `DERIVED-*`: deterministic application projection for system-native or imported records that do not yet have a persisted ID.
- `LEGACY-*`: deterministic identity for legacy migration evidence only.

A durable system-native ID and explicit `transactionGroupId` are still required before public Movement or SN Lifecycle APIs are enabled. System-native repair completion is never inferred from remark text; until linkage is persisted it remains a conflict. Legacy repair pairing may be inferred only under strict compatible-row rules and is always a warning.

## Options

| Option | Auditability | Sheet compatibility / reports | Concurrency and duplicate detection | Migration and API readiness |
|---|---|---|---|---|
| A. Add Movement ID and Correlation ID columns to the main ledger | Directly visible and strong once backfilled | Highest risk: formula ranges, reports and imports require regression and column governance | Sheet allocation remains vulnerable to concurrent writers | Medium migration effort; good API readiness after backfill |
| B. Independent System Movement Registry | Strong immutable registry linked through internal source references | No production ledger or report change | Best option for atomic ID allocation, idempotency and duplicate constraints | Moderate implementation effort; strongest near-term API foundation |
| C. Persist only after a future database migration | Strong after migration | No immediate Sheet impact | Current Sheet period remains without durable native identity | Lowest short-term effort but delays trustworthy APIs and makes later reconciliation harder |

## Recommendation

Use **Option B: an independent System Movement Registry**, while keeping the Feishu ledger as the operational system of record. The registry should store immutable movement ID, correlation ID, idempotency key, source-record reference and verification result; it must not become a competing inventory balance database. This preserves existing formulas and reports while providing concurrency-safe identity and duplicate detection.

Minimum registry contract:

```ts
interface MovementRegistryRecord {
  movementId: string;
  transactionGroupId?: string;
  correlationId?: string;
  idempotencyKey: string;
  sourceRecordFingerprint: string;
  ledgerVerificationStatus: 'PENDING' | 'VERIFIED' | 'MISMATCH';
  createdAt: string;
  createdBy: string;
}
```

The registry does **not** store authoritative inventory balances. It records identity, linkage, idempotency and ledger verification metadata; the Feishu ledger remains the operational ledger source.

Before implementation, define registry ownership, retention, backup and reconciliation controls. Do not expose public Movement/SN APIs until registry-to-ledger reconciliation and lifecycle replay pass against representative UAT data.
