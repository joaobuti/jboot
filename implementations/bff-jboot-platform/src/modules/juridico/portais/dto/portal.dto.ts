export type TenantPortalStatus = 'active' | 'inactive' | 'suspended';

export interface PortalDto {
  id: string;
  slug: string;
  name: string;
  authType: string;
  portalStatus: 'active' | 'inactive';
  contracted: boolean;
  tenantStatus: TenantPortalStatus | null;
}
