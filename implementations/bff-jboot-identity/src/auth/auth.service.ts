import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { normalizeDocument } from '../shared/document';
import { RequestContext } from '../shared/request-context';
import { AuthRepository } from './auth.repository';
import { DestinationRecord, IdentityRecord, IssuedContext } from './auth.types';
import { IdentityApplicationsCacheService } from './identity-applications-cache.service';
import { IdentityJwtService } from './jwt.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly jwt: IdentityJwtService,
    private readonly repository: AuthRepository
  ) {}

  async login(params: {
    document: string;
    password: string;
    deviceRef?: string;
    request: RequestContext;
  }) {
    let normalized: ReturnType<typeof normalizeDocument>;
    try {
      normalized = normalizeDocument(params.document);
    } catch {
      await this.audit.record({
        eventType: 'login_failed',
        ip: params.request.ip,
        userAgent: params.request.userAgent,
        metadata: { reason: 'invalid_document' }
      });
      throw new BadRequestException('Invalid document');
    }

    const authRecord = await this.repository.findIdentityWithPassword(
      normalized.documentType,
      normalized.documentNumber
    );

    if (!authRecord?.credential.secretHash) {
      await this.audit.record({
        eventType: 'login_failed',
        ip: params.request.ip,
        userAgent: params.request.userAgent,
        metadata: { reason: 'identity_or_password_not_found', documentType: normalized.documentType }
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(params.password, authRecord.credential.secretHash);
    if (!passwordOk) {
      await this.audit.record({
        eventType: 'login_failed',
        identityId: authRecord.identity.id,
        ip: params.request.ip,
        userAgent: params.request.userAgent,
        metadata: { reason: 'password_mismatch' }
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const destinations = await this.identityApplications.listDestinations(authRecord.identity.id);
    await this.audit.record({
      eventType: 'login_succeeded',
      identityId: authRecord.identity.id,
      ip: params.request.ip,
      userAgent: params.request.userAgent,
      metadata: { destinationCount: destinations.length }
    });

    if (destinations.length === 0) {
      throw new ForbiddenException('No application access');
    }

    if (destinations.length === 1) {
      const issued = await this.issueContext({
        identity: authRecord.identity,
        destination: destinations[0],
        request: params.request,
        deviceRef: params.deviceRef
      });
      return {
        selectionRequired: false,
        identity: this.publicIdentity(authRecord.identity),
        destination: destinations[0],
        ...issued
      };
    }

    return {
      selectionRequired: true,
      identity: this.publicIdentity(authRecord.identity),
      loginTicket: await this.jwt.issueLoginTicket(authRecord.identity.id),
      expiresIn: this.config.loginTicketTtlSeconds,
      destinations
    };
  }

  async selectContext(params: {
    loginTicket: string;
    clientId: string;
    applicationId: string;
    request: RequestContext;
  }): Promise<IssuedContext> {
    const ticket = await this.jwt.verifyLoginTicket(params.loginTicket);
    const destinations = await this.identityApplications.listDestinations(ticket.sub);
    const destination = destinations.find(
      (candidate) =>
        candidate.clientId === params.clientId && candidate.applicationId === params.applicationId
    );

    if (!destination) {
      await this.audit.record({
        eventType: 'context_selection_denied',
        identityId: ticket.sub,
        clientId: params.clientId,
        applicationId: params.applicationId,
        ip: params.request.ip,
        userAgent: params.request.userAgent
      });
      throw new ForbiddenException('Context not allowed');
    }

    const issued = await this.issueContext({
      identity: { id: ticket.sub } as IdentityRecord,
      destination,
      request: params.request
    });

    await this.audit.record({
      eventType: 'context_selected',
      identityId: ticket.sub,
      clientId: destination.clientId,
      applicationId: destination.applicationId,
      sessionContextId: issued.context.sessionId,
      ip: params.request.ip,
      userAgent: params.request.userAgent
    });

    return issued;
  }

  async switchContext(params: {
    accessToken: string;
    clientId: string;
    applicationId: string;
    request: RequestContext;
    deviceRef?: string;
  }): Promise<IssuedContext & { destination: DestinationRecord }> {
    const payload = await this.jwt.verifyAccessToken(params.accessToken);
    const destinations = await this.identityApplications.listDestinations(payload.sub);
    const destination = destinations.find(
      (candidate) =>
        candidate.clientId === params.clientId && candidate.applicationId === params.applicationId
    );

    if (!destination) {
      await this.audit.record({
        eventType: 'context_switch_denied',
        identityId: payload.sub,
        clientId: params.clientId,
        applicationId: params.applicationId,
        sessionContextId: payload.sid,
        ip: params.request.ip,
        userAgent: params.request.userAgent
      });
      throw new ForbiddenException('Context not allowed');
    }

    const issued = await this.issueContext({
      identity: { id: payload.sub } as IdentityRecord,
      destination,
      request: params.request,
      deviceRef: params.deviceRef
    });

    await this.audit.record({
      eventType: 'context_switched',
      identityId: payload.sub,
      clientId: destination.clientId,
      applicationId: destination.applicationId,
      sessionContextId: issued.context.sessionId,
      ip: params.request.ip,
      userAgent: params.request.userAgent
    });

    return { destination, ...issued };
  }

  private async issueContext(params: {
    identity: IdentityRecord;
    destination: DestinationRecord;
    request: RequestContext;
    deviceRef?: string;
  }): Promise<IssuedContext> {
    const expiresAt = new Date(Date.now() + this.config.accessTokenTtlSeconds * 1000);

    return this.database.transaction(async (client) => {
      const session = await this.repository.createSessionContext(client, {
        identityId: params.identity.id,
        destination: params.destination,
        expiresAt,
        ip: params.request.ip,
        userAgent: params.request.userAgent,
        deviceRef: params.deviceRef
      });

      const accessToken = await this.jwt.issueAccessToken({
        sessionId: session.sessionId,
        jwtId: session.jwtId,
        identityId: params.identity.id,
        destination: params.destination
      });

      await client.query(
        `INSERT INTO audit_events (
          event_type, identity_id, client_id, application_id, session_context_id, ip, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'token_issued',
          params.identity.id,
          params.destination.clientId,
          params.destination.applicationId,
          session.sessionId,
          params.request.ip ?? null,
          params.request.userAgent ?? null,
          JSON.stringify({ audience: params.destination.tokenAudience })
        ]
      );

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.config.accessTokenTtlSeconds,
        context: {
          sessionId: session.sessionId,
          clientId: params.destination.clientId,
          clientApplicationId: params.destination.clientApplicationId,
          applicationId: params.destination.applicationId,
          databaseRefId: params.destination.databaseRefId,
          applicationSlug: params.destination.applicationSlug,
          contractStatus: params.destination.contractStatus,
          planCode: params.destination.planCode,
          roles: params.destination.roles,
          scopes: params.destination.scopes
        }
      };
    });
  }

  private publicIdentity(identity: IdentityRecord) {
    return {
      id: identity.id,
      displayName: identity.displayName,
      documentType: identity.documentType
    };
  }

  async listApplicationsForToken(accessToken: string) {
    const payload = await this.jwt.verifyAccessToken(accessToken);
    const destinations = await this.identityApplications.listDestinations(payload.sub);
    return {
      identityId: payload.sub,
      sessionId: payload.sid,
      destinations
    };
  }
}
