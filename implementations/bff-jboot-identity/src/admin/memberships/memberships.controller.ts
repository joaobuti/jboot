import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { CreateMembershipDto, UpdateMembershipDto } from './dto/membership.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('admin-memberships')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients/:clientId/memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  async list(@Param('clientId') clientId: string, @Query() query: PageQueryDto) {
    return (await this.memberships.list(clientId, query)).rows;
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateMembershipDto,
    @Req() request: AdminRequest
  ) {
    return this.memberships.create(clientId, dto, buildMutateContext(request));
  }

  @Patch(':identityId')
  update(
    @Param('clientId') clientId: string,
    @Param('identityId') identityId: string,
    @Body() dto: UpdateMembershipDto,
    @Req() request: AdminRequest
  ) {
    return this.memberships.update(clientId, identityId, dto, buildMutateContext(request));
  }

  @Delete(':identityId')
  delete(
    @Param('clientId') clientId: string,
    @Param('identityId') identityId: string,
    @Req() request: AdminRequest
  ) {
    return this.memberships.update(clientId, identityId, { status: 'revoked' }, buildMutateContext(request));
  }
}
