# Sydney Warehouse Ledger Improvement

Public design and review repository for improving an existing Feishu-based Sydney warehouse operational ledger.

The project deliberately keeps the current ledger as the system of record. It does not introduce a new inventory database, ERP/WMS write-back, warehouse hardware integration, or external APIs.

## Current stage

Phase 1 safe foundation is implemented and verified against the production workbook.

- Strict TypeScript normalisation, controlled-value validation, protected-column guards, and typed write preparation are available for future workflows.
- The read-only data-quality scanner emits privacy-safe JSON and Markdown reports.
- Only the eight confirmed formula gaps were repaired: `H1653`, `I1653`, `AB1654:AC1656`.
- Post-repair current-inventory, weekly, and monthly reconciliation passed with no KPI changes.
- Business dates and operation-scoped optimistic concurrency have been hardened for future writes.
- A thin Next.js Web App provides the navigation shell, live read-only Dashboard, and a clearly labelled Work Order Preview Prototype. The preview performs zero writes.
- Shared text/XLSX section detection now hardens the Replacement boundary against Faulty Unit and other recognised sections, including case, whitespace, and colon variants. Preview remains fail-closed.
- Worksheet-matrix parsing is tested, but actual binary `.xlsx` upload remains disabled until a maintained decoder is implemented and verified.
- GitHub Actions runs the pure typecheck, unit-test, and production-build gates without Feishu credentials; the reviewed baseline workflow completed successfully.
- The Feishu Mini App target keeps secrets, ledger access, and command capability on the server and introduces no second inventory database.
- No operational business writer has been activated.

Return, Move, Adjustment, Label, warehouse-layout deployment, Today Task views, and AI write actions remain explicitly deferred.

## Repository map

- [`AGENTS.md`](AGENTS.md): constraints for GPT, Claude, Codex, and human contributors.
- [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md): requested second-review questions.
- [`docs/CURRENT_LEDGER_AUDIT.md`](docs/CURRENT_LEDGER_AUDIT.md): audited workbook structure and risks.
- [`docs/PHASE_1_2_SCOPE.md`](docs/PHASE_1_2_SCOPE.md): corrected implementation boundaries.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): phased delivery plan.
- [`docs/PHASE_1_IMPLEMENTATION.md`](docs/PHASE_1_IMPLEMENTATION.md): implemented code, controlled repair, verification, and limitations.
- [`reports/data-quality-latest.md`](reports/data-quality-latest.md): privacy-safe scan counts and safe row numbers.
- [`reports/phase1-reconciliation.md`](reports/phase1-reconciliation.md): aggregate/KPI release-gate result.
- [`reports/typed-date-e2e.md`](reports/typed-date-e2e.md): isolated Feishu typed-date write/read verification.
- [`docs/WEB_APP_ARCHITECTURE.md`](docs/WEB_APP_ARCHITECTURE.md): minimal Next.js/application-service boundaries, write lifecycle, concurrency design, routes, and release gates.
- [`docs/WEB_APP_ITERATION_1.md`](docs/WEB_APP_ITERATION_1.md): implemented routes, read services, preview limits, security boundary, and next release gates.
- [`docs/REVIEW_FIX_ITERATION.md`](docs/REVIEW_FIX_ITERATION.md): review findings, exact fixes, Dashboard metric definitions, parser/XLSX limitations, tests, and remaining write blockers.
- [`docs/PARSER_HARDENING.md`](docs/PARSER_HARDENING.md): shared section rules, adversarial coverage, fail-closed preview rules, and XLSX capability boundary.
- [`docs/FEISHU_MINI_APP_TARGET.md`](docs/FEISHU_MINI_APP_TARGET.md): future Mini App architecture, server security boundary, identity/roles, compatibility findings, and release gates.
- Other files under `docs/`: standards, schema, workflows, quality rules, views, and AI-skill refactor plan.

## Development

```bash
npm install
npm test
npm run build
```

The pure suite runs in CI. `npm run test:feishu-date` is a separate manual integration check and must use only an isolated non-production workbook.

Production scripts require the environment variables documented in `.env.example` and an authenticated `lark-cli` user session. Dry-run must precede formula apply.

## Privacy

The production Feishu URL, workbook token, credentials, operational files, serial numbers, and warehouse records are intentionally excluded. Examples in these documents are synthetic or generalized unless explicitly identified as structural audit findings.

## Review status

External review is welcome through GitHub issues. Reviewers should focus on correctness, safety, Feishu compatibility, reconciliation, and whether the design stays recognisable as the existing ledger.
