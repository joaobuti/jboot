import { Injectable } from '@nestjs/common';
import { PortaisRepository } from './portais.repository';
import { PortalDto, TenantPortalStatus } from './dto/portal.dto';

@Injectable()
export class PortaisService {
  constructor(private readonly repo: PortaisRepository) {}

  async list(clientId: string, databaseRef: string): Promise<PortalDto[]> {
    const rows = await this.repo.listForClient(clientId, databaseRef);
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      authType: row.authType,
      portalStatus: row.portalStatus as 'active' | 'inactive',
      contracted: Boolean(row.contracted),
      tenantStatus: (row.tenantStatus as TenantPortalStatus) ?? null,
    }));
  }
}
