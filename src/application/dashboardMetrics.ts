export interface DashboardLedgerActivity {
  action: string;
  sh: string;
  pickupCode: string;
  sku: string;
  qty?: number;
  outboundDate: string;
}

/**
 * Counts active pickup tasks by Pickup Code, falling back to SH.
 * Multiple SKU lines are one task; a later Outbound reduces matching SKU quantity.
 */
export function deriveAwaitingPickupTasks(rows: DashboardLedgerActivity[]): number {
  const aliases = new Map<string, string>();
  const balances = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const pickupAlias = row.pickupCode ? `pickup:${row.pickupCode}` : undefined;
    const shAlias = row.sh ? `sh:${row.sh}` : undefined;
    if (row.action === '备货') {
      if (row.outboundDate || !row.sku || row.qty === undefined || row.qty <= 0) continue;
      const group = pickupAlias ?? shAlias;
      if (!group) continue;
      if (pickupAlias) aliases.set(pickupAlias, group);
      if (shAlias) aliases.set(shAlias, group);
      const bySku = balances.get(group) ?? new Map<string, number>();
      bySku.set(row.sku, (bySku.get(row.sku) ?? 0) + row.qty);
      balances.set(group, bySku);
      continue;
    }
    if (row.action !== '出库' || !row.sku || row.qty === undefined || row.qty <= 0) continue;
    const group = (pickupAlias && aliases.get(pickupAlias)) || (shAlias && aliases.get(shAlias));
    if (!group) continue;
    const bySku = balances.get(group);
    if (!bySku) continue;
    bySku.set(row.sku, Math.max(0, (bySku.get(row.sku) ?? 0) - row.qty));
  }
  return [...balances.values()].filter((bySku) => [...bySku.values()].some((qty) => qty > 0)).length;
}
