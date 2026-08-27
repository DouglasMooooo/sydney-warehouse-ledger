# Feishu data migration contract

Historical ledger rows are preserved for audit and historical reporting. They are classified as `LEGACY_MIGRATION` (or `MANUAL_IMPORT`) and are never replayed into live operational stock.

The current inventory sheet is not trusted merely because it is named “当前库存明细”. For UAT it must be explicitly configured as `PHYSICAL_SNAPSHOT` or `EXPLICIT_BASELINE`, with `CURRENT_INVENTORY_BASELINE_EFFECTIVE_AT=ISO-8601-with-offset`. If the Google Sheet source is formula-derived from historical rows, freeze confirmed values into a separate baseline snapshot before migration. Stop legacy edits, freeze values, record the precise `effectiveAt`, deploy UAT, then enable writes.

Current operational state is exactly: the approved current baseline plus `SYSTEM_NATIVE` movements with `createdAt` strictly after its precise `effectiveAt`. Historical reports may consume legacy movements; current operational state may not. New system writes retain the human-readable ledger columns and carry the `[SYSTEM_NATIVE]` marker used by this classification.
