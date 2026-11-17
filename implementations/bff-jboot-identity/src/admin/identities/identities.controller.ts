import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { CreateIdentityDto, UpdateIdentityDto } from './dto/identity.dto';
import { AccountAccessService } from '../../account-access/account-access.service';
import { IdentitiesService } from './identities.service';

@ApiTags('admin-identities')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/identities')
export class IdentitiesController {
  constructor(
    private readonly identities: IdentitiesService,
    private readonly access: AccountAccessService
  ) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.identities.list(query)).rows;
  }

  @Post()
  create(@Body() dto: CreateIdentityDto, @Req() request: AdminRequest) {
    return this.identities.create(dto, buildMutateContext(request));
  }

  @Patch(':identityId')
  update(
    @Param('identityId') identityId: string,
    @Body() dto: UpdateIdentityDto,
    @Req() request: AdminRequest
  ) {
    return this.identities.update(identityId, dto, buildMutateContext(request));
  }

  /** Reenvia o convite de criar senha (conta `pending`); invalida o link anterior. */
  @Post(':identityId/invite')
  @HttpCode(200)
  invite(@Param('identityId', ParseUUIDPipe) identityId: string, @Req() request: AdminRequest) {
    const context = buildMutateContext(request);
    return this.access.sendInvite(identityId, context.actor.identityId, context.ip);
  }

  @Delete(':identityId')
  delete(@Param('identityId') identityId: string, @Req() request: AdminRequest) {
    return this.identities.update(identityId, { status: 'deleted' }, buildMutateContext(request));
  }
}
