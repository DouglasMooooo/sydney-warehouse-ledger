export interface MovementQuery { sn?: string; sku?: string; from?: string; to?: string }
export interface MovementDetail { movementId: string; occurredAt: string; action: string; sku?: string; sn?: string }
export interface MovementQueryResult { capabilityState: 'AVAILABLE' | 'MOVEMENT_MODEL_PENDING'; items: MovementDetail[] }
export interface MovementQueryService { search(query: MovementQuery): Promise<MovementQueryResult>; getById(movementId: string): Promise<MovementDetail | null> }
export class DependencyPendingError extends Error { readonly code = 'DEPENDENCY_PENDING'; }
export class PendingMovementQueryService implements MovementQueryService {
  async search(_query: MovementQuery): Promise<MovementQueryResult> { return { capabilityState: 'MOVEMENT_MODEL_PENDING', items: [] }; }
  async getById(_movementId: string): Promise<MovementDetail | null> { throw new DependencyPendingError('Movement IDs are not established.'); }
}
