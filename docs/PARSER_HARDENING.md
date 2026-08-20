# Work-Order Parser Hardening

## Boundary invariant

Plain-text and worksheet-matrix parsing now use the same section-heading detector in `src/workOrders/sectionHeadings.ts`. It trims surrounding whitespace, collapses internal whitespace, ignores case, and accepts no colon, an English colon, or a Chinese colon.

The detector assigns a canonical identity to `Replacement Unit information`, `Faulty Unit information`, and other recognised `... information` headings. After a parser enters the Replacement section, the first subsequent recognised section heading ends it immediately. Faulty Unit fields and unrelated-section fields therefore cannot reach replacement-line parsing.

This is deliberately fail-closed. A heading-like string that is not recognised does not silently create a replacement record, and incomplete or malformed rows produce warnings rather than invented values.

## Adversarial coverage

Regression tests cover:

- Faulty Unit before Replacement;
- English and Chinese trailing colons;
- case and whitespace differences;
- Faulty Unit as the terminating section;
- an arbitrary recognised section after Replacement;
- a work order containing only Faulty Unit data;
- multiple legitimate Replacement rows;
- malformed quantities and incomplete rows;
- worksheet source-row preservation and section separation.

The canonical parser can return multiple legitimate replacement lines. The current Prepared preview has a narrower safety contract: it produces a proposed row only when parser confidence is `high` and exactly one replacement line exists. Zero lines, multiple lines, malformed quantity, missing SKU, unsupported ERP warehouse, missing Product Master data, or insufficient stock yield structured errors and no proposed Prepared row.

## XLSX capability boundary

The worksheet-matrix parser is implemented and tested independently of file decoding. It shares the text parser's section rules, preserves `sourceRow`, supports multiple Replacement rows, and warns on malformed rows.

Actual binary `.xlsx` upload is not enabled. The browser prototype accepts text-based input only; it must not label a binary file as supported until a maintained server-side decoder is implemented and tested end to end. Parser capability is not the same as UI upload capability.

## Operational boundary

This hardening changes parsing, preview validation, tests, and documentation only. It does not create Prepared rows, reserve Pickup Codes, or write to the production Feishu ledger.
