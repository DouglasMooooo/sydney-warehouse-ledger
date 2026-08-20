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

Actual binary `.xlsx` upload is now enabled for preview only. The browser sends multipart bytes to the explicit server preview API; ExcelJS decodes the workbook in memory and passes worksheet matrices to the existing canonical parser. The route accepts only `.xlsx`, enforces a 5 MiB limit and ZIP signature, preserves source rows, and returns structured errors for malformed or unsupported input.

The browser does not decode the workbook, and uploaded bytes are not persisted or sent to an external AI API. Multiple legitimate Replacement lines are previewed independently. This capability does not reserve a Pickup Code or enable a business write.

## Operational boundary

This hardening changes parsing, preview validation, tests, and documentation only. It does not create Prepared rows, reserve Pickup Codes, or write to the production Feishu ledger.

## Private historical regression

`npm run test:work-orders-private` reads a gitignored local manifest and real XLSX files through the production ExcelJS decoder and parser. It reports only fixture ordinals and aggregate outcomes. No private fixtures were available during Phase 2.5, so blank-row behavior remains deliberately conservative: the first blank row terminates Replacement parsing. A bounded spacer-row rule may be added only after real fixtures prove that legitimate ERP templates require it, with tests that still stop at every recognised section and never use Faulty Unit as fallback.
