const OUTBOUND_REVERSAL_MARKER = /(?:^|[\s·])OUTBOUND_REVERSAL:(\d+)(?=$|[\s·])/i;

export function outboundReversalMarker(ledgerRow: number): string {
  if (!Number.isInteger(ledgerRow) || ledgerRow < 2) throw new TypeError('INVALID_OUTBOUND_LEDGER_ROW');
  return `OUTBOUND_REVERSAL:${ledgerRow}`;
}

export function reversedOutboundLedgerRow(remark: string | undefined): number | undefined {
  const matched = OUTBOUND_REVERSAL_MARKER.exec(remark ?? '');
  if (!matched) return undefined;
  const row = Number(matched[1]);
  return Number.isInteger(row) && row >= 2 ? row : undefined;
}
