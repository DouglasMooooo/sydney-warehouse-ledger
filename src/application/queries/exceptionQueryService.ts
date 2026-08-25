import type { AiExceptionSummary } from '../../ai/types.js';
export interface ExceptionQuery { code?: string; severity?: AiExceptionSummary['severity'] }
/** Read-only by construction: this contract deliberately exposes no resolve/dismiss/fix method. */
export interface ExceptionQueryService {
  searchOpen(query: ExceptionQuery): Promise<AiExceptionSummary[]>;
  summary(): Promise<Array<{ code: string; count: number }>>;
}
