import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, AdminRequest } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ClientDatabasesService } from './client-databases.service';

@ApiTags('admin-client-databases')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class ClientDatabasesController {
  constructor(private readonly clientDatabases: ClientDatabasesService) {}

  @Get('clients/:clientId/databases')
  listForClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.clientDatabases.listForClient(clientId);
  }

  @Post('clients/:clientId/databases/:applicationId/apply-rule')
  @HttpCode(200)
  applyForClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Req() request: AdminRequest
  ) {
    return this.clientDatabases.applyForClient(clientId, applicationId, buildMutateContext(request));
  }

  @Get('applications/:applicationId/client-databases')
  alignmentForApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.clientDatabases.alignmentForApplication(applicationId);
  }

  @Post('applications/:applicationId/client-databases/apply-rule')
  @HttpCode(200)
  applyForApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string, @Req() request: AdminRequest) {
    return this.clientDatabases.applyForApplication(applicationId, buildMutateContext(request));
  }
}
