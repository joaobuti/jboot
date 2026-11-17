import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ManagerAuthGuard, ManagerRequest } from '../manager-auth.guard';
import { CreateManagedUserDto } from './dto/create-managed-user.dto';
import { UpdateManagedUserDto } from './dto/update-managed-user.dto';
import { ManagerUsersService } from './manager-users.service';

@ApiTags('manager-users')
@ApiBearerAuth()
@UseGuards(ManagerAuthGuard)
@Controller('manager/users')
export class ManagerUsersController {
  constructor(private readonly service: ManagerUsersService) {}

  @Get()
  async list(@Req() req: ManagerRequest) {
    return (await this.service.list(req.managerActor)).rows;
  }

  @Get('lookup')
  async lookup(@Query('documentNumber') documentNumber: string) {
    const result = await this.service.lookupByDocument(documentNumber);
    if (!result) throw new NotFoundException('Identity not found');
    return result;
  }

  @Post()
  create(@Req() req: ManagerRequest, @Body() dto: CreateManagedUserDto) {
    return this.service.create(req.managerActor, dto);
  }

  @Patch(':identityId')
  update(
    @Req() req: ManagerRequest,
    @Param('identityId') identityId: string,
    @Body() dto: UpdateManagedUserDto
  ) {
    return this.service.update(req.managerActor, identityId, dto);
  }

  @Delete(':identityId')
  revoke(@Req() req: ManagerRequest, @Param('identityId') identityId: string) {
    return this.service.revoke(req.managerActor, identityId);
  }
}
