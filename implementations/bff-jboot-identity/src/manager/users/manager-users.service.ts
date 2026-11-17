import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentityApplicationsCacheService } from '../../auth/identity-applications-cache.service';
import { AuditService } from '../../audit/audit.service';
import { ManagerActor } from '../manager.types';
import { CreateManagedUserDto } from './dto/create-managed-user.dto';
import { UpdateManagedUserDto } from './dto/update-managed-user.dto';
import { ManagerUsersRepository } from './manager-users.repository';

@Injectable()
export class ManagerUsersService {
  constructor(
    private readonly repository: ManagerUsersRepository,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly audit: AuditService
  ) {}

  list(actor: ManagerActor) {
    return this.repository.listForApplication(actor.clientId, actor.applicationId);
  }

  async lookupByDocument(documentNumber: string) {
    const digits = documentNumber?.replace(/\D/g, '') ?? '';
    if (!digits) return null;
    const result = await this.repository.findByDocumentNumber(digits);
    return result.rows[0] ?? null;
  }

  async create(actor: ManagerActor, dto: CreateManagedUserDto) {
    const existing = await this.repository.findByDocumentNumber(dto.documentNumber);
    let identityId: string;

    if (existing.rows.length > 0) {
      identityId = existing.rows[0].id;
    } else {
      const identity = await this.repository.createIdentity(dto);
      identityId = identity.id;
    }

    if (dto.password) {
      await this.repository.upsertPassword(identityId, await bcrypt.hash(dto.password, 12));
    }

    // Propagate functional access, never delegation/tenant-management authority.
    const grantedScopes = actor.scopes.filter(s => s !== 'users:manage' && !s.endsWith(':users:manage'));
    const grantedRoles = actor.roles;

    // Location assignment rules:
    // - dto.locationId provided (admin explicitly chose) → use it
    // - otherwise inherit from actor (propagate creator's store)
    const resolvedLocationId = dto.locationId ?? actor.locationId;
    const moduleAttributes: Record<string, unknown> = resolvedLocationId
      ? { location_id: resolvedLocationId }
      : {};

    const entitlement = await this.repository.upsertEntitlement(
      identityId,
      actor.clientId,
      actor.applicationId,
      grantedScopes,
      grantedRoles,
      moduleAttributes
    );

    await this.identityApplications.invalidateIdentity(identityId);
    await this.audit.record({
      eventType: 'manager_user_created',
      identityId: actor.identityId,
      metadata: { clientId: actor.clientId, applicationId: actor.applicationId, targetIdentityId: identityId }
    });

    return entitlement;
  }

  async update(actor: ManagerActor, identityId: string, dto: UpdateManagedUserDto) {
    if (!dto.status) return;
    const result = await this.repository.updateEntitlementStatus(
      identityId,
      actor.clientId,
      actor.applicationId,
      dto.status
    );
    await this.identityApplications.invalidateIdentity(identityId);
    await this.audit.record({
      eventType: 'manager_user_updated',
      identityId: actor.identityId,
      metadata: { clientId: actor.clientId, applicationId: actor.applicationId, targetIdentityId: identityId, status: dto.status }
    });
    return result;
  }

  async revoke(actor: ManagerActor, identityId: string) {
    const result = await this.repository.updateEntitlementStatus(
      identityId,
      actor.clientId,
      actor.applicationId,
      'revoked'
    );
    await this.identityApplications.invalidateIdentity(identityId);
    await this.audit.record({
      eventType: 'manager_user_revoked',
      identityId: actor.identityId,
      metadata: { clientId: actor.clientId, applicationId: actor.applicationId, targetIdentityId: identityId }
    });
    return result;
  }
}
