# Warehouse Web App — Iteration 1

## Delivered

- Responsive internal app shell and navigation for Dashboard, Work Order / Prepared, Return to Repair, Move, Adjustment, and Label.
- `/dashboard`: server-rendered, read-only view of live main-ledger and current-inventory sources. It does not cache or create shadow status/inventory data.
- `/work-orders`: upload/paste input and a `PREVIEW_ONLY` Prepared workflow.
- `/api/warehouse/work-orders/prepare`: historical preview alias removed in Phase 2.6 so the only UAT work-order POST is the explicit XLSX `/preview` endpoint.
- `/returns`, `/moves`, `/adjustments`, and `/labels`: explicit “coming soon” pages only.

## Prepared preview rules

The text prototype extracts SH and replacement lines only from a literal `Replacement Unit information` section. `Faulty Unit` is never treated as Replacement. Product Master must contain the SKU. The server maps only explicitly supported ERP warehouse values and queries real current-inventory candidates with the exact SKU/condition and sufficient single-location quantity. Location and container are selected deterministically from those candidates. Pickup Code is an unreserved preview and must be reread and rechecked for uniqueness immediately before any future commit.

The response contains business fields only. It does not expose spreadsheet URL/token, sheet ID, cell/range coordinates, `ProposedChange`, credentials, or write primitives. There is no confirm endpoint, and the read port has no append/write method.

## Safety foundation

- `BusinessDate` accepts canonical calendar strings. Timestamps and JavaScript `Date` values are rejected on ordinary DTO/domain paths.
- Explicit Sydney `Date` conversion handles local calendar meaning; Feishu serial conversion uses timezone-independent UTC calendar arithmetic.
- An `OperationPrecondition` binds future business writes to one exact target row and all required named dependencies. Every snapshot is re-read immediately before write; stale inventory or other dependency changes return `STALE_WRITE_CONFLICT`.
- Typed date writes preserve numeric storage and `yyyy-mm-dd`, then verify stored type/format/effective date without touching formula columns.

## Known limitations

- The current ledger has no pre-Prepared work-order status, so Dashboard cannot truthfully calculate `待备货`; the UI shows it as unavailable rather than inventing a Status column.
- Production binary XLSX decoding/upload is not implemented. The adapter boundary and worksheet-matrix parsing core are present for a later maintained local decoder; the UI remains explicitly labelled Prototype.
- The app requires server-side Feishu environment variables and an authenticated `lark-cli` session. Missing access is shown as a visible system error.
- No browser-facing authentication/authorization, signed preview token, idempotency, concurrent Pickup Code commit, or post-write reconciliation orchestration is active yet.

## Next release gates

Before any confirm/write route is added: implement actor authentication/authorization and audit, signed short-lived preview tokens, exact operation dependency capture, idempotency, bounded Pickup Code collision handling, formula provisioning, typed reread verification, and current-inventory/KPI reconciliation. Production business writes remain disabled until all gates pass.
