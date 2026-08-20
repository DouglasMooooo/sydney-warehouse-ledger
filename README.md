# Sydney Warehouse Ledger Improvement

Public design and review repository for improving an existing Feishu-based Sydney warehouse operational ledger.

The project deliberately keeps the current ledger as the system of record. It does not introduce a new inventory database, ERP/WMS write-back, warehouse hardware integration, or external APIs.

## Current stage

Phase 2.6 read-only Feishu UAT code preparation is implemented; HTTPS deployment, Feishu console configuration, and live-user UAT remain pending.

- Strict TypeScript normalisation, controlled-value validation, protected-column guards, and typed write preparation are available for future workflows.
- The read-only data-quality scanner emits privacy-safe JSON and Markdown reports.
- Only the eight confirmed formula gaps were repaired: `H1653`, `I1653`, `AB1654:AC1656`.
- Post-repair current-inventory, weekly, and monthly reconciliation passed with no KPI changes.
- Business dates and operation-scoped optimistic concurrency have been hardened for future writes.
- A thin Next.js Web App provides a live read-only Dashboard, Today Tasks, Warehouse Layout, Exceptions, and real server-side XLSX Work Order Preview. The preview performs zero writes.
- Shared text/XLSX section detection now hardens the Replacement boundary against Faulty Unit and other recognised sections, including case, whitespace, and colon variants. Preview remains fail-closed.
- Binary `.xlsx` uploads are decoded in memory on the server with size/type checks and feed the strict Replacement-only parser; Faulty Unit data remains isolated.
- GitHub Actions runs the pure typecheck, unit-test, and production-build gates without Feishu credentials; the reviewed baseline workflow completed successfully.
- The Feishu Mini App target keeps secrets, ledger access, and command capability on the server and introduces no second inventory database.
- The live Warehouse Layout now shows actual SKU quantities at all 136 physical/master locations; its helper/layout totals reconcile to current inventory.
- Real Feishu OAuth identity, server-side role mapping, signed short-lived sessions, and independent API permission checks are implemented and fail closed.
- A hosted production read adapter uses official Feishu OpenAPI with a dedicated in-memory tenant-token cache; the local CLI reader remains available for development/admin scripts.
- Live and deep exceptions are truthfully separated. Deep quality scanning is explicit, rate-limited, and returns a safe operational DTO.
- `READ_ONLY_RELEASE=true`, the `只读试运行` banner, safe health status, bounded request logging, and private historical XLSX fixture support prepare read-only UAT.
- Production startup/readiness now fails closed unless the complete `READ_ONLY_UAT` OpenAPI/HTTPS/auth/role configuration is present; `/api/health` separately proves config and target-spreadsheet readability.
- Deep OpenAPI coverage is explicit about transport limits: date/formula checks are PARTIAL until live evidence, and unavailable validation metadata is not advertised as authoritative.
- The UAT parity runner compares privacy-safe business aggregates across trusted CLI and hosted OpenAPI reads; no real-ledger parity is claimed without execution evidence.
- No operational business writer has been activated.

Return, Move, Adjustment, Label confirmation, all AI/write actions, and every production business write remain explicitly deferred. Feishu console setup, HTTPS hosting, document permissions, and staff UAT are not claimed complete.

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
- [`docs/PHASE_2_OPERATIONAL_READ.md`](docs/PHASE_2_OPERATIONAL_READ.md): read-only modules, layout deployment, metric grains, XLSX boundary, permissions, and known limitations.
- [`docs/PHASE_2_5_READ_ONLY_RELEASE.md`](docs/PHASE_2_5_READ_ONLY_RELEASE.md): authenticated read-only boundary, exception coverage, OpenAPI strategy, security, and remaining UAT blockers.
- [`docs/FEISHU_DEPLOYMENT_CHECKLIST.md`](docs/FEISHU_DEPLOYMENT_CHECKLIST.md): exact internal H5 console, hosting, environment, security, and UAT steps.
- [`reports/phase2_5-release-gate.md`](reports/phase2_5-release-gate.md): privacy-safe Phase 2.5 evidence and release decision.
- [`docs/PHASE_2_6_UAT.md`](docs/PHASE_2_6_UAT.md): Phase 2.6 code boundary, truthful deep coverage, parity tooling, and live-UAT blockers.
- [`docs/FEISHU_UAT_CONFIGURATION.md`](docs/FEISHU_UAT_CONFIGURATION.md): exact project URLs, environment names, minimum read-only scopes, document access, roles, and CSP decision.
- [`reports/phase2_6-uat-release-gate.md`](reports/phase2_6-uat-release-gate.md): separate CODE, CONFIGURATION, and LIVE UAT evidence.
- [`reports/phase2-reconciliation.md`](reports/phase2-reconciliation.md): privacy-safe live layout and non-regression release gate.
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
