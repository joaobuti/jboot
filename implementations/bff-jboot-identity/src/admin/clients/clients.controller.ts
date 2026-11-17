import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@ApiTags('admin-clients')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  async list(@Query() query: PageQueryDto) {
    return (await this.clients.list(query)).rows;
  }

  @Post()
  create(@Body() dto: CreateClientDto, @Req() request: AdminRequest) {
    return this.clients.create(dto, buildMutateContext(request));
  }

  @Patch(':clientId')
  update(
    @Param('clientId') clientId: string,
    @Body() dto: UpdateClientDto,
    @Req() request: AdminRequest
  ) {
    return this.clients.update(clientId, dto, buildMutateContext(request));
  }

  @Delete(':clientId')
  delete(@Param('clientId') clientId: string, @Req() request: AdminRequest) {
    return this.clients.update(clientId, { status: 'deleted' }, buildMutateContext(request));
  }
}
