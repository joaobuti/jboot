import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, AdminRequest } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ClientAccessService } from './client-access.service';

@ApiTags('admin-client-access')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/clients/:clientId/admin-access')
export class ClientAccessController {
  constructor(private readonly access: ClientAccessService) {}

  /** "Reaplicar permissoes de admin": pacote completo em todos os modulos contratados. */
  @Post()
  @HttpCode(200)
  reapply(@Param('clientId', ParseUUIDPipe) clientId: string, @Req() request: AdminRequest) {
    return this.access.ensureAdminAccess(clientId, buildMutateContext(request));
  }
}
