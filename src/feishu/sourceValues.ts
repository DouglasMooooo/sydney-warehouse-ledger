export type SourceNumberResult =
  | { kind: 'valid'; value: number }
  | { kind: 'missing' }
  | { kind: 'invalid'; raw: unknown };

/** Typed source quantities must remain numeric; text numerics are reported as malformed. */
export function parseSourceNumber(value: unknown): SourceNumberResult {
  if (value === undefined || value === null || value === '') return { kind: 'missing' };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'valid', value };
  return { kind: 'invalid', raw: value };
}
