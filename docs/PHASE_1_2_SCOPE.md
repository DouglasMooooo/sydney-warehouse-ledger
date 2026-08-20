# Phase 1/2 corrected scope

## Historical data

Text dates and hidden characters in historical rows are detect → report → explain impact only. They must not be bulk-converted or bulk-cleaned. All new rows must follow strict typed-write standards.

## Confirmed formula repair only

Repair only H/I row 1653 and AB/AC rows 1654–1656 after reading surrounding formulas. Write only the missing cells, re-read results, and prove weekly/monthly reports are unchanged.

## Warehouse layout

Preserve the R1/R2 physical layout. Replace the Feishu-incompatible SKU extraction helper, then validate exactly:

1. Empty location.
2. One SKU.
3. Mixed SKU.
4. Container stock.

Each location must show every `SKU × Qty`, optional container, and total. The sum displayed by location must reconcile to current inventory by location.

## Today Task views

Derive views from current fields; do not create duplicate status state.

- 今日新工单
- 待备货
- 待取货
- 今日已出库
- 今日返修
- 异常待处理

Normal staff should see only Pickup Code, SH, SKU, Model, Qty, ERP Warehouse, From Location, Container, SN, Action, Date, and Actual Outbound Date.

## Dashboard

Build from current dynamic sources rather than the old hidden dashboard's fixed row limits.

Operational cards: 今日新工单、待备货、待取货、今日已出库、今日返修、异常数量。

Inventory cards: 新机、维修良品、待修、维修库存、报废。

## Deferred until Phase 3

No Work Order writes, Pickup Code writes, Return Intake writes, Move writes, Adjustment writes, or Label automation.

## Mandatory write protocol

READ → VALIDATE → PREVIEW/dry-run diff → WRITE → RE-READ → VERIFY → RECONCILE.

