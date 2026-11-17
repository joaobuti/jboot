import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/application.dto';

@ApiTags('admin-applications')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.applications.list(query)).rows;
  }

  @Post()
  create(@Body() dto: CreateApplicationDto, @Req() request: AdminRequest) {
    return this.applications.create(dto, buildMutateContext(request));
  }

  @Patch(':applicationId')
  update(
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateApplicationDto,
    @Req() request: AdminRequest
  ) {
    return this.applications.update(applicationId, dto, buildMutateContext(request));
  }

  @Delete(':applicationId')
  delete(@Param('applicationId') applicationId: string, @Req() request: AdminRequest) {
    return this.applications.update(applicationId, { status: 'disabled' }, buildMutateContext(request));
  }
}
