const FORBIDDEN_KEYS = new Set(['spreadsheetid','sheetid','rownumber','a1range','formula','tenanttoken','tenantaccesstoken','authorization','accesstoken','refreshtoken','googlecredential','googlecredentials','clientsecret','appsecret','rawproviderresponse']);
export class UnsafeAiPayloadError extends Error { readonly code = 'UNSAFE_AI_PAYLOAD'; }
export function assertAiSafePayload(value: unknown): void { visit(value, new Set<object>()); }
function visit(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return; seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.replace(/[_-]/g, '').toLowerCase())) throw new UnsafeAiPayloadError(`Forbidden AI response field: ${key}`);
    visit(nested, seen);
  }
}
