export const WAREHOUSE_ROLES = ['READ_ONLY', 'WAREHOUSE_OPERATOR', 'WAREHOUSE_ADMIN'] as const;
export type WarehouseRole = (typeof WAREHOUSE_ROLES)[number];

export interface WarehouseUser {
  userId: string;
  displayName?: string;
  roles: WarehouseRole[];
}

export type IdentitySource = 'FEISHU' | 'DEV_ONLY' | 'VISUAL_DEMO' | 'GOOGLE_SHEETS_UAT';

export interface WarehouseAuthContext {
  user: WarehouseUser;
  identitySource: IdentitySource;
}

export interface WarehouseIdentityAdapter {
  resolve(request: Request): Promise<WarehouseAuthContext | undefined>;
}
