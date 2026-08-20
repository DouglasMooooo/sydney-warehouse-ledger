import { resolveWarehouseAuthContext } from './authContext.js';
import { requireWarehousePermission, type WarehousePermission } from './permissions.js';

export function authenticateWarehouseRequest(request: Request, permission: WarehousePermission) {
  const context = resolveWarehouseAuthContext({ cookieHeader: request.headers.get('cookie') });
  requireWarehousePermission(context, permission);
  return context;
}
