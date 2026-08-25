export type RackSide = 'L' | 'R' | 'M';

export interface RackPosition {
  code: string;
  rack: number;
  row: number;
  bay: number;
  side: RackSide;
  sideLabel: '左侧' | '右侧' | '中间';
  description: string;
}

export function parseRackLocation(codeInput: string): RackPosition | undefined {
  const code = codeInput.trim().toUpperCase();
  const match = /^R(\d+)-(\d+)-(\d+)-([LRM])$/.exec(code);
  if (!match) return undefined;
  const rack = Number(match[1]);
  const row = Number(match[2]);
  const bay = Number(match[3]);
  const side = match[4] as RackSide;
  const sideLabel = side === 'L' ? '左侧' : side === 'R' ? '右侧' : '中间';
  return { code, rack, row, bay, side, sideLabel, description: `货架 ${rack} · 第 ${row} 排 · 第 ${bay} 个 Bay · ${sideLabel}` };
}

export function compareRackPositions(left: RackPosition, right: RackPosition): number {
  return left.rack - right.rack || left.row - right.row || left.bay - right.bay || left.side.localeCompare(right.side);
}
