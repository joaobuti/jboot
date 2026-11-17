import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { ProvisionFlowUserDto } from './dto/provision-flow-user.dto';
import { UserProvisioningService } from './user-provisioning.service';
import { buildMutateContext } from '../shared/request-context';

@ApiTags('kanban-user-settings')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/settings/users')
export class UserProvisioningController {
  constructor(private readonly service: UserProvisioningService) {}

  @Post()
  @HttpCode(202)
  @RequireScopes('users:manage', 'flow:users:manage')
  provision(
    @Req() request: KanbanRequest,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ProvisionFlowUserDto
  ) {
    if (!authorization) throw new UnauthorizedException('Missing bearer token');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) {
      throw new UnprocessableEntityException({ code: 'invalid_idempotency_key' });
    }
    return this.service.provision(buildMutateContext(request), authorization, idempotencyKey, dto);
  }
}
