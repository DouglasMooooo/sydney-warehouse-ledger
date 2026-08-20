# Agent instructions

These instructions apply to AI reviewers and contributors.

## Core principle

Everything must remain based on the current ledger. Do not redesign the ledger, create a new inventory database, or add unnecessary workflow entities.

## Safety

- Never request or publish production Feishu credentials, workbook tokens, operational exports, customer data, SH numbers, Pickup Codes, or serial numbers.
- Historical date and hidden-character issues are detect/report/explain only. Do not bulk-fix them.
- New records must use explicit types: real dates, numeric Qty, and text identifiers.
- Formula repair is limited to confirmed gaps. Never fill entire columns or overwrite historical fixed-value areas.
- Before any proposed write: READ → VALIDATE → PREVIEW. Afterward: RE-READ → VERIFY → RECONCILE.
- Do not activate Work Order, Pickup Code, Return, Move, Adjustment, or Label writes during Phase 1/2.

## Review expectations

- Prefer small deterministic helpers and Feishu-native views/formulas.
- Do not add a manually maintained Status field unless unavoidable.
- Derive task and exception views from existing ledger fields.
- Treat weekly/monthly report reconciliation as a release gate.
- Clearly separate confirmed evidence, inference, and recommendation.

## Contributions

Open an issue before proposing structural changes. Pull requests should be small, include a dry-run diff, list exact cells/views affected, and provide reconciliation evidence.

