# Sydney Warehouse Ledger Improvement

Public design and review repository for improving an existing Feishu-based Sydney warehouse operational ledger.

The project deliberately keeps the current ledger as the system of record. It does not introduce a new inventory database, ERP/WMS write-back, warehouse hardware integration, or external APIs.

## Current stage

Phase 1 safe foundation is implemented and verified against the production workbook.

- Strict TypeScript normalisation, controlled-value validation, protected-column guards, and typed write preparation are available for future workflows.
- The read-only data-quality scanner emits privacy-safe JSON and Markdown reports.
- Only the eight confirmed formula gaps were repaired: `H1653`, `I1653`, `AB1654:AC1656`.
- Post-repair current-inventory, weekly, and monthly reconciliation passed with no KPI changes.
- No operational business writer has been activated.

Warehouse-layout deployment, Today Task views, dashboard work, and AI actions remain explicitly deferred to the next iteration.

## Repository map

- [`AGENTS.md`](AGENTS.md): constraints for GPT, Claude, Codex, and human contributors.
- [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md): requested second-review questions.
- [`docs/CURRENT_LEDGER_AUDIT.md`](docs/CURRENT_LEDGER_AUDIT.md): audited workbook structure and risks.
- [`docs/PHASE_1_2_SCOPE.md`](docs/PHASE_1_2_SCOPE.md): corrected implementation boundaries.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): phased delivery plan.
- [`docs/PHASE_1_IMPLEMENTATION.md`](docs/PHASE_1_IMPLEMENTATION.md): implemented code, controlled repair, verification, and limitations.
- [`reports/data-quality-latest.md`](reports/data-quality-latest.md): privacy-safe scan counts and safe row numbers.
- [`reports/phase1-reconciliation.md`](reports/phase1-reconciliation.md): aggregate/KPI release-gate result.
- Other files under `docs/`: standards, schema, workflows, quality rules, views, and AI-skill refactor plan.

## Development

```bash
npm install
npm test
npm run build
```

Production scripts require the environment variables documented in `.env.example` and an authenticated `lark-cli` user session. Dry-run must precede formula apply.

## Privacy

The production Feishu URL, workbook token, credentials, operational files, serial numbers, and warehouse records are intentionally excluded. Examples in these documents are synthetic or generalized unless explicitly identified as structural audit findings.

## Review status

External review is welcome through GitHub issues. Reviewers should focus on correctness, safety, Feishu compatibility, reconciliation, and whether the design stays recognisable as the existing ledger.
