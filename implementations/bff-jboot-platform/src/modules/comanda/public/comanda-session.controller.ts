import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ComandaSessionGuard } from '../guards/comanda-session.guard';
import { ComandaSessionService } from '../services/comanda-session.service';
import { CreateComandaSessionDto } from '../dto/create-session.dto';
import { ComandaRequest } from '../comanda.types';

/**
 * Rota publica e anonima — cliente final escaneia o QR da mesa, sem login,
 * sem JWT do Identity Hub. `POST /sessions` NUNCA declara
 * @UseGuards(ComandaSessionGuard) (ainda nao existe sessao nesse ponto);
 * `refresh` declara, pois exige sessao ja aberta. NUNCA usar `PdvAuthGuard`
 * aqui — ver checklist em modules/comanda/MODULE_CONTRACT.md.
 */
@ApiTags('comanda-public')
@Controller('comanda/public/sessions')
export class ComandaSessionController {
  constructor(private readonly service: ComandaSessionService) {}

  @Post()
  createSession(@Body() dto: CreateComandaSessionDto) {
    return this.service.createSession(dto);
  }

  @Post('refresh')
  @UseGuards(ComandaSessionGuard)
  refreshSession(@Req() request: ComandaRequest) {
    return this.service.refreshSession(request.comandaContext);
  }
}
