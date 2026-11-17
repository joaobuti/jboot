import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { CreateEntitlementDto, UpdateEntitlementDto } from './dto/entitlement.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('admin-entitlements')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients/:clientId/entitlements')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get()
  async list(@Param('clientId') clientId: string, @Query() query: PageQueryDto) {
    return (await this.entitlements.list(clientId, query)).rows;
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateEntitlementDto,
    @Req() request: AdminRequest
  ) {
    return this.entitlements.create(clientId, dto, buildMutateContext(request));
  }

  @Patch(':identityId/:applicationId')
  update(
    @Param('clientId') clientId: string,
    @Param('identityId') identityId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateEntitlementDto,
    @Req() request: AdminRequest
  ) {
    return this.entitlements.update(clientId, identityId, applicationId, dto, buildMutateContext(request));
  }

  @Delete(':identityId/:applicationId')
  delete(
    @Param('clientId') clientId: string,
    @Param('identityId') identityId: string,
    @Param('applicationId') applicationId: string,
    @Req() request: AdminRequest
  ) {
    return this.entitlements.update(
      clientId,
      identityId,
      applicationId,
      { status: 'revoked' },
      buildMutateContext(request)
    );
  }
}
