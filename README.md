# Sydney Warehouse Ledger Improvement

Public design and review repository for improving an existing Feishu-based Sydney warehouse operational ledger.

The project deliberately keeps the current ledger as the system of record. It does not introduce a new inventory database, ERP/WMS write-back, warehouse hardware integration, or external APIs.

## Current stage

Phase 1/2 planning and independent review. No production ledger implementation code or operational data is published here.

Current approved scope:

1. Forward-looking typed write helpers for new records.
2. Repair only confirmed formula gaps.
3. Restore SKU-level warehouse-layout visibility.
4. Derive Today Task views from existing ledger fields.
5. Build a lightweight operations dashboard from dynamic sources.

Work-order writes, Pickup Code writes, return intake, movement, adjustments, and label automation remain out of scope until Phase 3.

## Repository map

- [`AGENTS.md`](AGENTS.md): constraints for GPT, Claude, Codex, and human contributors.
- [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md): requested second-review questions.
- [`docs/CURRENT_LEDGER_AUDIT.md`](docs/CURRENT_LEDGER_AUDIT.md): audited workbook structure and risks.
- [`docs/PHASE_1_2_SCOPE.md`](docs/PHASE_1_2_SCOPE.md): corrected implementation boundaries.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): phased delivery plan.
- Other files under `docs/`: standards, schema, workflows, quality rules, views, and AI-skill refactor plan.

## Privacy

The production Feishu URL, workbook token, credentials, operational files, serial numbers, and warehouse records are intentionally excluded. Examples in these documents are synthetic or generalized unless explicitly identified as structural audit findings.

## Review status

External review is welcome through GitHub issues. Reviewers should focus on correctness, safety, Feishu compatibility, reconciliation, and whether the design stays recognisable as the existing ledger.

