import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../auth/user-auth.guard';
import { RequiredScopes } from '../../auth/required-scopes.decorator';
import { ToolCatalog } from './tool-catalog';

@ApiTags('tools')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@RequiredScopes('ai:agents:manage')
@Controller('v1/tools')
export class ToolController {
  constructor(private readonly catalog: ToolCatalog) {}

  @Get()
  list() {
    return this.catalog.list();
  }
}
