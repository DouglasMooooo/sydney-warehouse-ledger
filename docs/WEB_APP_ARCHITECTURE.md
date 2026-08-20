# Warehouse Operations Web App Architecture

## Decision

Build one thin internal Next.js + TypeScript application. The existing Feishu ledger remains the only inventory system of record. There is no shadow inventory database, direct browser-to-Feishu access, ERP/WMS integration, or arbitrary-cell API.

```text
Next.js pages/routes
  -> application services (prepare / confirm)
    -> existing normalisation, validation, formula and reconciliation rules
      -> Feishu adapter
        -> current Feishu ledger
```

## Minimal folder structure

Keep the repository simple and reuse the current `src/` modules instead of moving or duplicating them.

```text
app/
  (warehouse)/
    dashboard/page.tsx             # implemented: live, read-only
    work-orders/page.tsx           # implemented: preview only
    returns/page.tsx
    moves/page.tsx
    adjustments/page.tsx
    labels/page.tsx
  api/warehouse/
    work-orders/prepare/route.ts
    work-orders/confirm/route.ts   # intentionally absent until release gates pass
    returns/prepare/route.ts
    returns/confirm/route.ts
    moves/prepare/route.ts
    moves/confirm/route.ts
    adjustments/prepare/route.ts
    adjustments/confirm/route.ts
    labels/prepare/route.ts
    labels/confirm/route.ts

src/
  application/
    contracts.ts                 # business-shaped ports and service contracts
    clientDtos.ts                # strict untrusted browser DTO allowlists
    dashboardService.ts          # live read-through dashboard query
    workOrderPreview.ts          # deterministic PREVIEW_ONLY workflow
  config/                        # existing ledger schema/controlled values
  ledger/                        # existing domain and safety layer
  feishu/                        # existing CLI adapter primitives
  quality/                       # existing gates/scanners

tests/
  application/
  integration/
```

Do not create a second app, microservices, or a database package. React components collect/display data only; they do not contain ledger rules or cell coordinates.

## Application-service boundaries

Executable interfaces live in `src/application/contracts.ts`:

- `DashboardQueryService`: read-only operational and inventory snapshot.
- `InventoryQueryService`: lookup by SN/SKU and real available location/container.
- `WorkOrderService`: parse/validate a work order and prepare a strict `备货` plan; confirm later.
- `ReturnIntakeService`: lookup history and prepare `退回维修`, Qty 1, `REPAIR-01`, `待修`.
- `MoveService`: lookup trusted current location/SKU/condition, require unchanged condition, prepare move.
- `AdjustmentService`: controlled exceptional adjustments, including future repaired-good receipt to `FLEX-01`.
- `PickupCodeService`: deterministic `SYD-00000` allocation with recheck/retry; AI never chooses a code.
- `LabelService`: deterministic output from confirmed and verified Prepared rows only.

Future mutating services expose `prepare(...)` and `confirm(...)`:

- `prepare` is read-only. It normalises, validates, queries current state, plans formula requirements, captures the relevant state fingerprint/revision, and returns a signed short-lived preview token.
- `confirm` verifies the token and actor, re-reads the relevant state immediately before writing, and returns `STALE_WRITE_CONFLICT` when the fingerprint changed.

The signed preview token contains the normalised plan, source-state fingerprint, expiry, actor binding, and operation kind. It is not inventory storage. A production deployment must protect the signing secret and limit token lifetime.

## Feishu adapter boundary

The future `WarehouseLedgerPort` should expose business-shaped methods, never arbitrary cell writes:

```ts
interface WarehouseLedgerPort {
  readDashboard(asOf: BusinessDate): Promise<DashboardSnapshot>;
  readInventoryContext(query: InventoryQuery): Promise<InventoryContext>;
  inspectAppendTarget(): Promise<AppendTargetInspection>;
  captureOperationState(command: OperationContext): Promise<OperationPrecondition>;
  commitVerifiedRow(command: VerifiedRowCommand): Promise<LedgerWriteReceipt>;
  verifyWrite(receipt: LedgerWriteReceipt): Promise<LedgerWriteVerificationResult>;
  reconcile(receipt: LedgerWriteReceipt): Promise<ReconciliationResult>;
}
```

Only the adapter maps domain fields to `A:AC`. Route handlers and React code cannot receive spreadsheet URLs, sheet IDs, row numbers, `ProposedChange[]`, or a general-purpose write function.

## Write lifecycle

```text
READ context + append target
  -> NORMALISE + VALIDATE
  -> inspect future-row formula/helper template
  -> capture relevant state revision/fingerprint
  -> PREVIEW (no write)
  -> user confirms
  -> re-read and compare relevant state
       changed -> STALE_WRITE_CONFLICT
  -> atomically provision agreed formula gaps + explicit business cells
  -> RE-READ raw values/formulas/styles + typed date view
  -> verifyLedgerWrite
  -> current inventory + weekly KPI + monthly KPI reconciliation
  -> success only if every gate passes
```

For a future new row, formula provisioning is restricted to protected columns and a confirmed append target. `planFutureRowFormulaTemplate()` requires two agreeing neighbouring formula patterns, emits formula-only repairs, and fails on disagreement or insufficient evidence. It never copies historical business values and never performs whole-column fill.

## Business dates

`BusinessDate` is a branded canonical `YYYY-MM-DD` calendar value. The normal browser and application path accepts strings only; JavaScript `Date`, timestamps, and invalid calendar dates are rejected. Explicit `Date` conversion uses the `Australia/Sydney` timezone. Feishu serials are calculated directly from UTC calendar components, so the effective ledger date is independent of the Node process timezone and Sydney daylight-saving transitions.

## Optimistic concurrency

Browser and route code cannot provide an arbitrary range. The application constructs an `OperationPrecondition` containing one exact target row plus named dependencies required by that operation, such as current inventory, serial history/current state, inventory selection, or Pickup Code uniqueness. The Feishu write adapter re-reads every target/dependency snapshot immediately before a business write. A changed dependency throws `STALE_WRITE_CONFLICT`; an unrelated snapshot cannot authorize a target-row write.

Pickup Code allocation remains inactive. Its future transaction is:

1. Read valid codes/current maximum.
2. Calculate the next deterministic `SYD-00000` candidate.
3. Immediately before the Prepared write, re-read maximum and global uniqueness.
4. On conflict, regenerate and retry within a small bounded loop.
5. Write Prepared through the same guarded commit.
6. Re-read and confirm global uniqueness before returning success.

## Initial pages

| Route | Responsibility |
| --- | --- |
| `/dashboard` | 今日备货工单、待备货（不可用）、按 Pickup/SH 分组的待取货、今日已出库、今日返修、异常数量；新机、维修良品、待修、维修库存、报废 |
| `/work-orders` | Upload/paste work order, Replacement Unit parsing, Product Master validation, available stock recommendation, preview only until write gates are released |
| `/returns` | SN history/conflict lookup and Return to Repair preview |
| `/moves` | Current source/condition lookup, target selection and Move preview |
| `/adjustments` | Controlled increase/decrease workflows; no irregular outbound bypass |
| `/labels` | Deterministic label preview from confirmed Prepared records |

All dashboard and inventory values come from the existing ledger/current-inventory sources. There is no cache, shadow status, or inventory database. `待备货` is shown as unavailable because the current ledger has no pre-prepared status record.

The implemented Prepared prototype accepts plain text only, parses replacement lines strictly within a literal Replacement section, validates the SKU against Product Master, maps ERP warehouse through an explicit fail-closed allowlist, recommends only an actual matching single-location inventory candidate, and previews the next unreserved Pickup Code. Binary XLSX upload is not yet wired. It performs zero writes and exposes no confirm endpoint.

## Release gates and current blockers

No Prepared/Return/Move/Adjustment business write may go live until all are satisfied:

- Unit tests and strict TypeScript build pass.
- Isolated Feishu date integration proves numeric raw storage, `yyyy-mm-dd`, and correct effective business date.
- Qty and identifiers are verified by type and exact normalised value.
- Required formula/helper cells are present and error-free after recalculation.
- Formula provisioning and business values are composed as one guarded append operation; this orchestration is not active yet.
- Current inventory, weekly KPI, and monthly KPI reconciliation pass for representative synthetic writes.
- No unexpected business or protected-cell changes.
- AuthN/authZ, actor audit, signed preview-token handling, retry limits and idempotent confirm behaviour are implemented.
- Pickup Code global uniqueness is proven under concurrent confirmation.
- Production append-row formula patterns and validation-column acceptable states are mapped and approved without modifying historical fixed-value areas.

Current CLI capability is adequate for value + `cell_styles.number_format` writes and typed `+table-get` reread. The remaining limitation is architectural rather than a date-format API gap: production row provisioning, reconciliation rollback/incident handling, idempotency and concurrent Pickup Code commit are intentionally not activated in this iteration.
