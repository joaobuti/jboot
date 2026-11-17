import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { PortaisService } from './portais.service';

@ApiTags('juridico-portais')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/portais')
export class PortaisController {
  constructor(private readonly portais: PortaisService) {}

  @Get()
  list(@Req() request: JuridicoRequest) {
    const { clientId, databaseRef } = request.juridicoContext;
    return this.portais.list(clientId, databaseRef);
  }
}
