import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { DatabaseRefsService } from './database-refs.service';
import { CreateDatabaseRefDto, UpdateDatabaseRefDto } from './dto/database-ref.dto';

@ApiTags('admin-database-refs')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/database-refs')
export class DatabaseRefsController {
  constructor(private readonly databaseRefs: DatabaseRefsService) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.databaseRefs.list(query)).rows;
  }

  @Post()
  create(@Body() dto: CreateDatabaseRefDto, @Req() request: AdminRequest) {
    return this.databaseRefs.create(dto, buildMutateContext(request));
  }

  @Patch(':databaseRefId')
  update(
    @Param('databaseRefId') databaseRefId: string,
    @Body() dto: UpdateDatabaseRefDto,
    @Req() request: AdminRequest
  ) {
    return this.databaseRefs.update(databaseRefId, dto, buildMutateContext(request));
  }

  @Delete(':databaseRefId')
  delete(@Param('databaseRefId') databaseRefId: string, @Req() request: AdminRequest) {
    return this.databaseRefs.update(databaseRefId, { status: 'disabled' }, buildMutateContext(request));
  }
}
