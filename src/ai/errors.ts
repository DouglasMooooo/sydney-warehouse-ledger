export class AiQueryError extends Error {
  constructor(readonly code: 'UNSUPPORTED_QUERY'|'DEPENDENCY_PENDING'|'NOT_FOUND'|'INVALID_SH_REFERENCE', message: string) { super(message); }
}
