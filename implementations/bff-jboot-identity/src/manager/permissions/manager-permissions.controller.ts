import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ManagerAuthGuard, ManagerRequest } from '../manager-auth.guard';
import { ReplaceModulePermissionsDto } from './dto/replace-module-permissions.dto';
import { ManagerPermissionsService } from './manager-permissions.service';

@ApiTags('manager-permissions')
@ApiBearerAuth()
@UseGuards(ManagerAuthGuard)
@Controller('manager')
export class ManagerPermissionsController {
  constructor(private readonly service: ManagerPermissionsService) {}

  @Get('module-permissions')
  catalog(@Req() req: ManagerRequest) {
    return this.service.catalog(req.managerActor);
  }

  @Put('users/:identityId/module-permissions')
  replace(
    @Req() req: ManagerRequest,
    @Param('identityId', ParseUUIDPipe) identityId: string,
    @Body() dto: ReplaceModulePermissionsDto
  ) {
    return this.service.replace(req.managerActor, identityId, dto);
  }
}
