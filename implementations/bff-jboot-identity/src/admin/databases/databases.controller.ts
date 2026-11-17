import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { DatabasesService } from './databases.service';
import { CreateDatabaseDto, UpdateDatabaseDto } from './dto/database.dto';

@ApiTags('admin-databases')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/databases')
export class DatabasesController {
  constructor(private readonly databases: DatabasesService) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.databases.list(query)).rows;
  }

  @Post()
  create(@Body() dto: CreateDatabaseDto, @Req() request: AdminRequest) {
    return this.databases.create(dto, buildMutateContext(request));
  }

  @Patch(':databaseId')
  update(
    @Param('databaseId') databaseId: string,
    @Body() dto: UpdateDatabaseDto,
    @Req() request: AdminRequest
  ) {
    return this.databases.update(databaseId, dto, buildMutateContext(request));
  }

  @Delete(':databaseId')
  delete(@Param('databaseId') databaseId: string, @Req() request: AdminRequest) {
    return this.databases.update(databaseId, { status: 'disabled' }, buildMutateContext(request));
  }
}
