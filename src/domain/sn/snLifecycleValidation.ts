import type { CurrentSnState } from './types.js';
export function currentStateSignature(state:CurrentSnState):string{
  return state.status==='IN_STOCK'?`${state.sku}|${state.location}|${state.stockCondition}`:state.status;
}
