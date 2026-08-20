const workOrderAllowedKeys = new Set([
  'businessDate', 'sourceText', 'sourceFileName',
]);

export interface WorkOrderPreviewClientDto {
  businessDate: string;
  sourceText: string;
  sourceFileName?: string;
}

export interface MoveClientDto {
  businessDate: string;
  sn: string;
  targetLocation: string;
}

export function parseWorkOrderPreviewClientDto(value: unknown): WorkOrderPreviewClientDto {
  const input = record(value);
  rejectUnknownKeys(input, workOrderAllowedKeys);
  const dto: WorkOrderPreviewClientDto = {
    businessDate: requiredString(input.businessDate, 'businessDate'),
    sourceText: requiredString(input.sourceText, 'sourceText'),
  };
  if (input.sourceFileName !== undefined) {
    dto.sourceFileName = requiredString(input.sourceFileName, 'sourceFileName');
    if (/\.xlsx$/i.test(dto.sourceFileName)) throw new TypeError('XLSX_NOT_SUPPORTED');
  }
  return dto;
}

export function parseMoveClientDto(value: unknown): MoveClientDto {
  const input = record(value);
  const allowed = new Set(['businessDate', 'sn', 'targetLocation']);
  rejectUnknownKeys(input, allowed);
  return {
    businessDate: requiredString(input.businessDate, 'businessDate'),
    sn: requiredString(input.sn, 'sn'),
    targetLocation: requiredString(input.targetLocation, 'targetLocation'),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('request body must be an object');
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(input).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`UNSUPPORTED_CLIENT_FIELD:${unknown}`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be text`);
  return value.trim();
}
