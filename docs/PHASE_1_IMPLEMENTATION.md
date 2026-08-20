# Phase 1 Implementation

## Result

The first safe implementation foundation is complete. The production change was limited to the eight pre-approved formula cells, and the reconciliation release gate passed.

## Implemented helpers

- Executable ledger schema with business and protected column allowlists.
- Controlled actions and stock conditions.
- Forward-looking normalisers for dates, SH numbers, Pickup Codes, containers, SKUs, SNs, locations, quantities, actions, and stock conditions.
- Dates use branded `YYYY-MM-DD` calendar values and are proposed as Feishu numeric date serials with a date number format; SKUs remain text.
- Deterministic action-specific validation with structured error codes.
- `prepareLedgerWrite()` returns typed proposed business cells only. It is not connected to an operational workflow and does not expose an arbitrary business-cell writer.
- Explicit Feishu range reads, formula reads, dry-run changes, protected-column guards, atomic explicit-cell writes, and post-write verification.

## Scanner

The read-only scanner covers all rules required for this iteration and writes privacy-safe reports under `reports/`. Historical issues are detected only; the scanner never modifies rows.

The current `lark-cli` response does not expose a stored type for every date cell. `DATE_STORED_AS_TEXT` is implemented and will trigger when that metadata is available, but the current live zero count must not be interpreted as proof that the previously audited historical text dates disappeared. The earlier audited baseline remains authoritative for that issue.

Large affected-row lists are omitted from committed reports. Counts remain present, and small row lists are included only when safe. No operational values, customer data, SN dumps, workbook URL, or credentials are committed.

## Formula dry-run and repair

The repair script:

1. Captured an ignored local BEFORE snapshot for `A1648:AC1660`, the current weekly KPI cells, the current-month KPI cells, and current-inventory aggregates.
2. Re-read each target and nearest valid formulas above and below it.
3. Required both neighbour formulas to reduce to the same row-relative pattern.
4. Printed an exact dry-run diff.
5. Applied one atomic eight-operation batch restricted by a hard-coded allowlist.
6. Re-read every target formula and compared all business columns in the safety range with the BEFORE snapshot.

Repaired cells:

- `H1653`
- `I1653`
- `AB1654`, `AC1654`
- `AB1655`, `AC1655`
- `AB1656`, `AC1656`

No rows were copied, no columns were filled down, and no business cell changed.

## Reconciliation

The release gate compared aggregate current-inventory totals, nine current-week KPIs, and eight current-month KPIs. Every item passed and all before/after values were unchanged. See `reports/phase1-reconciliation.md`.

## Verification

- TypeScript strict build: PASS.
- Automated tests: 52 passed after approved review corrections, date/concurrency hardening, and Web App preview expansion.
- Isolated Feishu typed-date write/read: PASS. The write carried a numeric date serial and `yyyy-mm-dd`; typed reread confirmed a date-compatible dtype, the same number format, and the expected business date.
- Post-repair scanner: `FORMULA_MISSING = 0`, `FORMULA_BROKEN = 0`.
- Business-cell snapshot comparison: PASS.
- Current-inventory, weekly, and monthly reconciliation: PASS.

## Limitations and next phase

This phase intentionally does not implement work-order, Pickup Code, Return to Repair, Move, adjustment, label, or other operational writes. The first Web App iteration adds a read-only dashboard and Work Order / Prepared preview only; other modules remain placeholders.

The thin Warehouse Operations Web App described in `WEB_APP_ARCHITECTURE.md` has begun under the same repository and safety layer.

## Approved review corrections

- `期初库存` and `入库` now require date, quantity, target location, and stock condition.
- `移库`, `库存调增`, and `库存调减` now require date.
- Remark normalisation is separate from identifier normalisation and preserves meaningful internal line breaks/tabs.
- Explicit date writes carry `cell_styles.number_format`, require numeric date serials, use typed reread verification, and compare protected columns before/after business writes.
- `verifyLedgerWrite()` checks exact business values, raw value types, date formats/effective dates, required formulas, protected state, and formula error results.
- Non-dry-run business writes require a preview-time state fingerprint and immediately re-check it; changed relevant state returns `STALE_WRITE_CONFLICT`.
- Future-row formula planning is formula-only, restricted to confirmed new rows, and requires two agreeing neighbouring patterns.
- Strict normal work-order outbound validation remains unchanged. Exceptional quantity corrections are reserved for controlled adjustments.

No additional spreadsheet workflow or view functionality was added.
