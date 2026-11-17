import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, AdminRequest } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { CapabilitiesService } from './capabilities.service';
import { CapabilityCatalogQueryDto, SetClientCapabilitiesDto } from './dto/capability.dto';

@ApiTags('admin-capabilities')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  listCatalog(@Query() query: CapabilityCatalogQueryDto) {
    return this.capabilities.listCatalog(query.applicationSlug);
  }
}

@ApiTags('admin-client-capabilities')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients/:clientId/capabilities')
export class ClientCapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  list(@Param('clientId') clientId: string) {
    return this.capabilities.listForClient(clientId);
  }

  @Put()
  set(
    @Param('clientId') clientId: string,
    @Body() dto: SetClientCapabilitiesDto,
    @Req() request: AdminRequest
  ) {
    return this.capabilities.setForClient(clientId, dto, buildMutateContext(request));
  }
}
