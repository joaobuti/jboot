import { ConflictException, ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfigService } from '../../../config/app-config.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { OfficesRepository } from '../offices/offices.repository';
import { ProvisionFlowUserDto } from './dto/provision-flow-user.dto';
import { FlowIdentityClient } from './flow-identity.client';
import { UserProvisioningRepository } from './user-provisioning.repository';
import { ActiveOfficeService } from '../offices/active-office.service';

@Injectable()
export class UserProvisioningService {
  constructor(
    private readonly commands: UserProvisioningRepository,
    private readonly offices: OfficesRepository,
    private readonly identity: FlowIdentityClient,
    private readonly config: AppConfigService,
    private readonly activeOffice: ActiveOfficeService
  ) {}

  async provision(context: MutateContext, authorization: string, key: string, dto: ProvisionFlowUserDto) {
    const hash = createHmac('sha256', this.config.userProvisioningHmacKey)
      .update(JSON.stringify(dto))
      .digest('hex');
    const command = await this.commands.begin(context.databaseRef, context.clientId, context.identityId, key, hash);
    if (command.requestSha256 !== hash) {
      throw new ConflictException({ code: 'idempotency_payload_conflict', message: 'Idempotency key was used with another payload' });
    }
    if (command.state === 'completed') return this.response(command);
    if (!command.claimed) return this.response(command);

    try {
      const officeIds = await this.resolveOfficeIds(context, dto.officeIds ?? []);
      const identityId = command.identityId ?? await this.identity.createUser(authorization, dto.identity);
      await this.commands.setIdentity(context.databaseRef, command.id, identityId, officeIds);
      await this.offices.replaceUserOffices(
        context.databaseRef, context.clientId, identityId, officeIds, context.identityId
      );
      const completed = await this.commands.complete(context.databaseRef, command.id, context, identityId, officeIds);
      return this.response(completed);
    } catch (error) {
      await this.commands.fail(context.databaseRef, command.id, this.errorCode(error));
      throw error;
    }
  }

  /**
   * So `flow:admin` atribui mais de um escritorio a um usuario (flow-offices-sprints.md, S2). Gestor
   * delegado (sem `users:manage`): o usuario novo entra no escritorio ativo de quem cadastra.
   */
  private async resolveOfficeIds(context: MutateContext, requested: string[]): Promise<string[]> {
    if (!context.scopes.includes('users:manage')) {
      return [await this.activeOffice.require(context as unknown as KanbanRequestContext)];
    }
    const unique = [...new Set(requested)].sort();
    if (unique.length > 1 && !context.scopes.includes('flow:admin')) {
      throw new ForbiddenException({ code: 'multiple_offices_admin_only', message: 'Only flow:admin can link a user to more than one office' });
    }
    const offices = await this.offices.listByIds(context.databaseRef, context.clientId, unique);
    if (offices.length !== unique.length || offices.some(office => !office.active)) {
      throw new UnprocessableEntityException({ code: 'office_not_allowed', message: 'Office is not active in this tenant' });
    }
    return unique;
  }

  private errorCode(error: unknown): string {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    if (typeof response === 'object' && response && 'code' in response && typeof response.code === 'string') return response.code;
    return 'user_provisioning_failed';
  }

  private response(command: { id: string; state: string; identityId: string | null; officeIds: string[]; errorCode: string | null }) {
    return {
      commandId: command.id,
      state: command.state,
      identityId: command.identityId,
      officeIds: command.officeIds,
      errorCode: command.errorCode
    };
  }
}
