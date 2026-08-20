# Phase 2 Operational Read Experience

## Delivered boundary

Phase 2 adds a thin, read-only warehouse operations experience while keeping the existing Feishu ledger as the only system of record. It adds no inventory database, ERP/WMS integration, confirm route, or production business writer.

The application now exposes purpose-specific Dashboard, Today Tasks, Warehouse Layout, Exceptions, and Work Order XLSX Preview routes. Every server page and API resolves a server-side identity and checks an explicit permission. Development and tests use a clearly marked `DEV_ONLY` operator; production fails closed until a real Feishu session adapter is configured.

## Warehouse Layout

`src/application/locationSummary.ts` is the single deterministic location aggregator. Only positive, well-formed current-inventory records contribute. It groups repeated SKU rows, preserves actual SKU detail, sorts SKU/container text, excludes zero availability, and reports malformed or missing quantities instead of coercing them.

The live Feishu repair preserved the existing R1, R2, row/column, L/R, and service-location structure. The only changed online regions were:

- helper display formulas: `当前库存明细查询!S2:S137`;
- R1 layout: `仓库布局可视化!B5:S8`;
- R2 layout: `仓库布局可视化!B11:P14`;
- service locations: `B19`, `E19`, `B22`, and `E22`.

The helper produces `location`, one line per real `SKU × Qty`, optional deterministic container text, and `总数`. Empty locations show `空`. Layout cells perform only a compatible location lookup into the helper output. The Web App reads current inventory directly, includes all 136 master locations (including empty locations), and groups them into R1, R2, and service sections without exposing helper columns.

The online sequence was read, local XLSX snapshot, formula proof, atomic dry run, target verification, execution, reread, and reconciliation. The adjacent helper formula immediately after the intended range was also checked and restored to its snapshot-equivalent logic before the final reconciliation.

## Today Tasks and dashboard metrics

All task states are derived; no manual Status column was introduced.

| UI metric | Definition | Grain |
| --- | --- | --- |
| 今日备货工单 | `Action = 备货` and Date = Sydney today | distinct SH count |
| 待备货 | unavailable because no reliable pre-Prepared source exists | unavailable |
| 待取货（派生） | unoffset Prepared balances; Outbound offsets later matching SKU quantities | task count, Pickup Code then SH fallback |
| 今日已出库 | `Action = 出库` and actual outbound date = Sydney today | task count, Pickup Code then SH fallback |
| 今日返修 | `Action = 退回维修` and Date = Sydney today | Qty |
| 异常数量 | current derived exception records | issue count |
| inventory cards/breakdowns | current-inventory records | Qty |
| 本周发货 / 本周返修 / 本月发货 | matching ledger action/date within Sydney period | Qty |

One SH can contain multiple detail rows. Fully offset Prepared tasks are omitted. The UI retains the limitation that historical rows without Pickup Code can require manual review when an SH has been reused.

## Exceptions

The read-only exception service returns operational DTOs with severity, code, safe row reference, task identifiers where available, description, and suggested action. It supports the Phase 2 rule catalogue, including ledger validation, inventory quantity, and container-location consistency rules.

Stored date type, formula presence/result, and data-validation state require cell metadata that the current typed-table read adapter does not expose. Those rule codes remain visible in the supported catalogue, but the live view does not claim a clean result for those metadata-dependent rules. The earlier audit remains authoritative until the adapter supplies per-cell metadata.

## XLSX preview

Binary `.xlsx` decoding now runs server-side with ExcelJS 4.4.0. Uploads are kept in memory, limited to 5 MiB, checked for the `.xlsx` extension and ZIP signature, and never sent to an external AI API. Unsupported, empty, oversized, or malformed files return structured errors.

The decoder feeds the existing canonical worksheet parser. Literal Replacement sections are isolated from Faulty Unit sections; source rows and multiple legitimate replacement lines are preserved. Each parsed line receives an independent strict Prepared preview. The response remains explicitly `zeroWritesPerformed`; Pickup Codes are unreserved suggestions and there is no confirm button or confirm endpoint.

The dependency tree uses a `uuid` override to avoid the vulnerable transitive version. `npm audit --omit=dev` reports zero vulnerabilities at this release point.

## Security and operational limits

- Browser DTOs contain no Feishu URL/token, credential, command capability, sheet ID, or helper coordinate.
- Explicit read/preview APIs enforce permissions and import no write adapter.
- Production authentication is intentionally unavailable until real Feishu launch/session verification is implemented.
- No business row, weekly/monthly formula, protected formula column, or validation rule was changed.
- Return, Move, Adjustment, Label confirmation, and all production mutations remain deferred.

See `reports/phase2-reconciliation.md` for the privacy-safe release gate.
