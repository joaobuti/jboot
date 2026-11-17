import { BadRequestException, Injectable } from '@nestjs/common';
import { MutateContext } from '../admin.types';
import { AdminAuditService } from '../shared/admin-audit.service';
import { CapabilitiesRepository } from './capabilities.repository';
import { capabilityDependencyViolations } from './capability-dependencies';
import { SetClientCapabilitiesDto } from './dto/capability.dto';

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly repository: CapabilitiesRepository
  ) {}

  async listCatalog(applicationSlug?: string) {
    return (await this.repository.listCatalog(applicationSlug)).rows;
  }

  async listForClient(clientId: string) {
    return (await this.repository.listForClient(clientId)).rows;
  }

  /**
   * Valida os slugs contra o catalogo antes de gravar. A FK
   * `client_capabilities_capability_fkey` ja impediria slug inexistente, mas
   * devolveria erro de banco cru; aqui o operador recebe qual slug e invalido.
   */
  async setForClient(clientId: string, dto: SetClientCapabilitiesDto, context: MutateContext) {
    if (dto.capabilities.length === 0) {
      return this.listForClient(clientId);
    }

    const catalog = (await this.repository.listCatalog()).rows;
    const known = new Set(catalog.map((row) => row.slug));
    const unknown = dto.capabilities.map((entry) => entry.slug).filter((slug) => !known.has(slug));
    if (unknown.length > 0) {
      throw new BadRequestException(`Capability desconhecida: ${unknown.join(', ')}`);
    }

    const deduplicated = new Map(dto.capabilities.map((entry) => [entry.slug, entry.enabled]));
    const entries = [...deduplicated].map(([slug, enabled]) => ({ slug, enabled }));
    const violations = capabilityDependencyViolations(catalog, await this.listForClient(clientId), entries);
    if (violations.length > 0) {
      throw new BadRequestException(violations.join('; '));
    }

    await this.repository.setForClient(clientId, entries, context.actor.identityId);
    await this.audit.record('admin_client_capabilities_updated', context, {
      clientId,
      capabilities: entries
    });

    return this.listForClient(clientId);
  }
}
