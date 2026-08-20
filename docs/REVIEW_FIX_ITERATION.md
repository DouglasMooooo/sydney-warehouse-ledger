# Review-Fix Iteration

## Scope and result

This iteration addresses the approved review findings without adding a business workflow or enabling a production write. The Feishu ledger remains the system of record. Protected-column, formula, typed-date, optimistic-concurrency, and post-write verification controls remain unchanged.

## Exact fixes

- ERP warehouse mapping is an explicit allowlist. `悉尼良品仓` maps to `维修良品`; `悉尼物料仓` maps to `新机` for the current replacement-machine rule. Blank and unknown values return `ERP_WAREHOUSE_UNSUPPORTED`; there is no fallback.
- Work-order parsing now has canonical types and parser interfaces under `src/workOrders/`. Plain text reads replacement requirements only after the literal `Replacement Unit information` title. Faulty fields are never replacement requirements. Ambiguous, missing, or malformed sections require confirmation. The canonical parser supports multiple lines; the current preview remains deliberately limited to one unambiguous line.
- XLSX evolution has a server-side binary-reader contract plus a tested worksheet-matrix parser that supports multiple replacement rows and source row numbers. No maintained binary decoder was selected in this focused pass, so `.xlsx` upload is not enabled and the UI is labelled “Work Order Preview Prototype”. No file is sent to an external AI service.
- Business date entry points are now `parseBusinessDateString()`, `businessDateFromSydneyInstant()`, and `todayInSydney()`. Deprecated compatibility aliases remain temporarily, while application logic uses the explicit APIs.
- `今日新工单` is renamed `今日备货工单`; it counts distinct SH values prepared on the Sydney business date. `待备货` remains unavailable because the current ledger has no reliable pre-Prepared state.
- `待取货` counts active tasks by Pickup Code, falling back to SH. Multiple SKU lines in one group count as one task. A later matching Outbound reduces the outstanding quantity for its SKU; the task closes only when every SKU balance is zero. Prepared rows already carrying an outbound date are not active.
- Inventory recommendation requires exact SKU/condition, one real location able to fulfil the full quantity, then orders by available quantity descending, location ascending, and container ascending. No split-location recommendation is performed.
- Ledger normalization errors retain their actual field (`date`, `qty`, `pickupCode`, `action`, and other wrapped fields) instead of collapsing to `action`.
- Source quantities use a typed parser that distinguishes valid zero, missing, and malformed values. Bad inventory quantities are excluded from totals and added to Dashboard exception counts instead of becoming zero silently.
- Pickup Code remains an unreserved preview. It may change; a future commit must reread all codes and check uniqueness immediately before the transaction write.

## Test and CI gates

The pure suite contains 70 tests. Required parser, ERP mapping, date, Dashboard sequence/grouping, recommendation, numeric-source, normalization-field, formula, date-write, and concurrency regressions are covered. The GitHub Actions workflow runs `npm ci`, typecheck, unit tests, and the production build for pushes and pull requests. Live Feishu E2E remains separate/manual and CI contains no Feishu credential.

## Remaining blockers

This is not production-ready ERP work-order support. Binary XLSX decoding, browser authentication/authorization, signed preview tokens, idempotency, concurrent Pickup Code allocation, formula provisioning orchestration, post-write reconciliation, and production release approval are still required. Return, Move, Adjustment, Label, AI write actions, and all production business writes remain disabled.
