import { ACTIONS } from '../config/controlledValues.js';
import type { LedgerScanRow, QualityCode, QualityReport } from './types.js';
import { scanRow } from './rules.js';

const ALL_CODES: QualityCode[] = [
  'DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'INVALID_ACTION', 'INVALID_STOCK_CONDITION',
  'INVALID_LOCATION', 'INVALID_QTY', 'MISSING_SKU', 'MISSING_SN',
  'PREPARED_WITHOUT_SOURCE_LOCATION', 'PREPARED_WITHOUT_PICKUP_CODE',
  'PRODUCT_OUTBOUND_WITHOUT_SN', 'RETURN_WITHOUT_TARGET_LOCATION', 'MOVE_WITHOUT_SOURCE',
  'MOVE_WITHOUT_TARGET', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK',
  'CONTAINER_MISMATCH', 'MISSING_INVENTORY_QTY', 'INVALID_INVENTORY_QTY',
];

export function scanLedger(rows: LedgerScanRow[], validLocations: ReadonlySet<string> = new Set()): QualityReport {
  const issues = rows.flatMap((row) => scanRow(row, validLocations));
  const counts = Object.fromEntries(ALL_CODES.map((code) => [code, 0])) as Record<QualityCode, number>;
  const affectedRows: Partial<Record<QualityCode, number[]>> = {};
  for (const item of issues) {
    counts[item.code] += 1;
    (affectedRows[item.code] ??= []).push(item.row);
  }
  for (const code of ALL_CODES) {
    if (affectedRows[code]) affectedRows[code] = [...new Set(affectedRows[code])].sort((a, b) => a - b);
  }
  return {
    generatedAt: new Date().toISOString(), sheet: '主表 库存流水', scannedRows: rows.length,
    counts, affectedRows, issues,
  };
}

export function publicReport(report: QualityReport) {
  const safeRows = Object.fromEntries(
    Object.entries(report.affectedRows).filter(([, rows]) => (rows?.length ?? 0) <= 100),
  );
  return {
    generatedAt: report.generatedAt, sheet: report.sheet, scannedRows: report.scannedRows,
    counts: report.counts, affectedRows: safeRows, rules: Object.keys(report.counts),
    rowNumberPolicy: 'Row lists over 100 entries are omitted; counts remain authoritative.',
    limitations: [
      'DATE_STORED_AS_TEXT is counted only when the connector exposes a per-cell stored type. The current CLI response did not expose it, so zero is not proof that historical text dates are absent.',
    ],
  };
}

export function reportMarkdown(report: QualityReport): string {
  const lines = [
    '# Data Quality Scan', '',
    `Generated: ${report.generatedAt}`, '',
    `Scanned rows: ${report.scannedRows}`, '',
    '| Rule | Count | Safe row numbers |', '|---|---:|---|',
  ];
  for (const [code, count] of Object.entries(report.counts)) {
    const rows = report.affectedRows[code as QualityCode] ?? [];
    const rowText = rows.length > 100 ? 'omitted (>100 rows)' : rows.join(', ');
    lines.push(`| ${code} | ${count} | ${rowText} |`);
  }
  lines.push(
    '', `Controlled actions checked: ${ACTIONS.join('、')}.`, '',
    'Limitation: DATE_STORED_AS_TEXT requires per-cell stored-type metadata. The current CLI response did not expose it; a zero live count is not proof that historical text dates are absent.', '',
    'No operational values, SNs, customer data, or credentials are included.',
  );
  return `${lines.join('\n')}\n`;
}
