import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ComandaSessionGuard } from '../guards/comanda-session.guard';
import { ComandaOrderService } from '../services/comanda-order.service';
import { CreateComandaPedidoDto } from '../dto/create-pedido.dto';
import { ComandaRequest } from '../comanda.types';

/**
 * Rotas publicas do lado cliente do `comanda`, todas atras de
 * `ComandaSessionGuard` (sessao emitida por `POST /comanda/public/sessions`).
 * NUNCA declarar `PdvAuthGuard`/`ScopeGuard` aqui — ver checklist em
 * modules/comanda/MODULE_CONTRACT.md.
 */
@ApiTags('comanda-public')
@Controller('comanda/public')
@UseGuards(ComandaSessionGuard)
export class ComandaOrderController {
  constructor(private readonly service: ComandaOrderService) {}

  @Get('me')
  getMe(@Req() request: ComandaRequest) {
    return this.service.getMe(request.comandaContext);
  }

  @Post('pedidos')
  createPedido(
    @Req() request: ComandaRequest,
    @Body() dto: CreateComandaPedidoDto,
    @Headers('Idempotency-Key') idempotencyKey?: string
  ) {
    return this.service.createPedido(request.comandaContext, dto, idempotencyKey);
  }

  @Delete('itens/:itemId')
  cancelItem(@Req() request: ComandaRequest, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.cancelItem(request.comandaContext, itemId);
  }

  @Post('fechamento')
  requestClosing(@Req() request: ComandaRequest) {
    return this.service.requestClosing(request.comandaContext);
  }
}
