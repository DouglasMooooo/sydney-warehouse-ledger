# Feishu Deployment Readiness — Migration Review Boundary

## Scope

Feishu is the intended deployment target for migration review. This document describes a future server-side integration boundary only; the current bulk-approval and freeze-preview commands produce local ignored artifacts and make **zero** Feishu, ledger, or database writes.

## Required server-side configuration

- `FEISHU_APP_ID` and `FEISHU_APP_SECRET` must remain server-side environment variables.
- Feishu OAuth/session validation must resolve a real human `open_id`; do not accept a user identity from client input.
- Feishu spreadsheet credentials and ledger write capabilities must not be exposed to the browser, AI clients, or logging.
- Migration operators must be configured separately from warehouse operators:
  - `MIGRATION_REVIEW`: may inspect candidates and exceptions.
  - `MIGRATION_APPROVE`: may preview or confirm a bulk approval command.
  - `MIGRATION_FREEZE`: may request a read-only freeze preview; persistence remains unavailable.

## Routes and command boundary

Future migration routes must use this sequence:

```text
Feishu authenticated human → server permission check → migration application command
→ deterministic candidate/batch fingerprint check → append-only review audit artifact
```

The page must never write candidate state directly. A client must submit the displayed `reviewBatchFingerprint`; the server regenerates the eligible set and fails with `STALE_REVIEW_BATCH` if it differs.

Mutation-class commands (`bulk approval`, manual decision, and freeze preview) require a human principal with the relevant migration permission. `WAREHOUSE_OPERATOR` alone is insufficient.

## AI restrictions

AI, Copilot, LLM, and service principals may read a sanitized migration status only. They must not approve, bulk approve, override, freeze, persist a baseline, or write the Operational Ledger. The domain bulk-approval command fails closed with `FORBIDDEN` unless the principal is `HUMAN` and holds `MIGRATION_APPROVE`.

No migration SN or movement API is exposed while the baseline remains unfrozen and the post-cutover audit has no real movements.

## Operational ledger boundary

- Current commands: read-only candidate generation, local review artifacts, local freeze preview.
- Prohibited now: Feishu baseline rows, opening balances, Operational Ledger writes, database persistence, Movement Registry implementation.
- A future persistence command must be separately designed, permissioned, idempotent, and include an explicit rollback procedure.

## Rollback and audit

- Review decisions are append-only events. A later change must reference and supersede a prior decision; it must not rewrite history.
- Keep generated SN/review/freeze artifacts outside Git. They are already ignored.
- If a review batch is stale or duplicate decisions occur, fail closed and create a new review scope rather than applying a silent precedence rule.
- Before any production cutover: freeze preview → approved persistence design → Feishu cutover → real movements → post-cutover replay audit.
