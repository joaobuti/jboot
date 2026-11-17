import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ClientApplicationsService } from './client-applications.service';
import { CreateClientApplicationDto, UpdateClientApplicationDto } from './dto/client-application.dto';

@ApiTags('admin-client-applications')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients/:clientId/applications')
export class ClientApplicationsController {
  constructor(private readonly clientApplications: ClientApplicationsService) {}

  @Get()
  async list(@Param('clientId') clientId: string, @Query() query: PageQueryDto) {
    return (await this.clientApplications.list(clientId, query)).rows;
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientApplicationDto,
    @Req() request: AdminRequest
  ) {
    return this.clientApplications.create(clientId, dto, buildMutateContext(request));
  }

  @Patch(':applicationId')
  update(
    @Param('clientId') clientId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateClientApplicationDto,
    @Req() request: AdminRequest
  ) {
    return this.clientApplications.update(clientId, applicationId, dto, buildMutateContext(request));
  }

  @Delete(':applicationId')
  delete(
    @Param('clientId') clientId: string,
    @Param('applicationId') applicationId: string,
    @Req() request: AdminRequest
  ) {
    return this.clientApplications.update(
      clientId,
      applicationId,
      { status: 'cancelled' },
      buildMutateContext(request)
    );
  }
}
