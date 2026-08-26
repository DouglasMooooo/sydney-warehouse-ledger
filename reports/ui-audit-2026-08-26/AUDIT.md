# Warehouse Operations UI audit — 2026-08-26

## Scope

Combined UX and visual review of Work Order Preparation, Move, Repair Complete, and warehouse-location selection. The audit used the local design fixture so no ledger write was attempted.

## Flow evidence

1. **Original inventory operation form — poor.** `01-before-moves.png` shows a single-record form split across three narrow columns. Batch SN entry and visual target selection were missing, while the empty preview panel consumed a large part of the screen.
2. **Original work-order page — needs improvement.** `02-before-work-orders.png` shows label printing inside a narrow right-side panel that disappears at smaller desktop widths. This separates printing from the “import work order → print label → find stock” sequence.
3. **Rebuilt batch Move — good.** `03-after-batch-move.png` presents one numbered flow: import/paste SN, choose one target location, then review and confirm. Duplicate counts and file removal are visible before preview.
4. **Visual target selection — good.** `04-after-target-location-picker.png` reuses the live warehouse matrix. Every registered rack/service location is a real target control; empty/occupied and mixed-SKU states remain visible.
5. **Rebuilt Repair Complete — good.** `05-after-repair-complete.png` uses the same batch interaction, but states the repair-specific checks and repaired-good SN conversion.

## Highest-impact changes

- Removed single-SN text entry from Move and Repair Complete and replaced it with batch paste/upload.
- Moved label printing into the central work-order sequence before SN/location confirmation.
- Added one reusable visual target-location mode instead of accepting manually typed location codes.
- Kept preview, confirmation, server-side inventory reread, controlled append, and write verification intact.

## Accessibility and evidence limits

- Location cells expose explicit button names such as “选择目标库位 R1-2-3-L”, and workflow controls remain native buttons/inputs.
- Screenshots confirm visible hierarchy, target size, contrast risk, and responsive structure only. Keyboard traversal, screen-reader announcements, and live Feishu write behavior still require deployed UAT testing.
