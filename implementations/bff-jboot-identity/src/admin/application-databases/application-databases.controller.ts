import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ApplicationDatabasesService } from './application-databases.service';
import { CreateApplicationDatabaseDto, UpdateApplicationDatabaseDto } from './dto/application-database.dto';

@ApiTags('admin-application-databases')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/applications/:applicationId/databases')
export class ApplicationDatabasesController {
  constructor(private readonly applicationDatabases: ApplicationDatabasesService) {}

  @Get()
  async list(@Param('applicationId') applicationId: string, @Query() query: PageQueryDto) {
    return (await this.applicationDatabases.list(applicationId, query)).rows;
  }

  @Post()
  create(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateApplicationDatabaseDto,
    @Req() request: AdminRequest
  ) {
    return this.applicationDatabases.create(applicationId, dto, buildMutateContext(request));
  }

  @Patch(':applicationDatabaseId')
  update(
    @Param('applicationDatabaseId') applicationDatabaseId: string,
    @Body() dto: UpdateApplicationDatabaseDto,
    @Req() request: AdminRequest
  ) {
    return this.applicationDatabases.update(applicationDatabaseId, dto, buildMutateContext(request));
  }

  @Delete(':applicationDatabaseId')
  delete(@Param('applicationDatabaseId') applicationDatabaseId: string, @Req() request: AdminRequest) {
    return this.applicationDatabases.update(
      applicationDatabaseId,
      { status: 'disabled' },
      buildMutateContext(request)
    );
  }
}
