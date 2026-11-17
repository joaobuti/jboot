import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { AddSaleItemDto, AddSalePaymentDto, ApplyDiscountDto, CancelSaleDto, CompleteSaleDto, CreateSaleDto, EmitNfDto, InitiatePixPaymentDto, SaleListQueryDto, UpdateSaleItemDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@ApiTags('pdv-sales')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequireScopes('pdv:sales:read')
  list(@Query() query: SaleListQueryDto, @Req() request: PdvRequest) {
    return this.sales.list(request.pdvContext, { limit: query.limit, offset: query.offset, status: query.status });
  }

  @Post()
  @RequireScopes('pdv:sales:write')
  create(@Body() dto: CreateSaleDto, @Req() request: PdvRequest) {
    return this.sales.create(request.pdvContext, dto);
  }

  @Get(':id')
  @RequireScopes('pdv:sales:read')
  findOne(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.sales.findById(request.pdvContext, id);
  }

  /**
   * Sprint 6 (CPF-na-nota): sugestao de destinatario pra tela de emissao de
   * NF, quando a venda veio do fechamento de uma comanda de autoatendimento.
   * `null` (200) quando a venda nao tem comanda de origem — nao e erro.
   */
  @Get(':id/comanda-customer')
  @RequireScopes('pdv:sales:read')
  comandaCustomer(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.sales.getComandaCustomerSuggestion(request.pdvContext, id);
  }

  @Post(':id/items')
  @RequireScopes('pdv:sales:write')
  addItem(@Param('id') id: string, @Body() dto: AddSaleItemDto, @Req() request: PdvRequest) {
    return this.sales.addItem(request.pdvContext, id, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  @RequireScopes('pdv:sales:write')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @Req() request: PdvRequest) {
    return this.sales.removeItem(request.pdvContext, id, itemId);
  }

  @Patch(':id/items/:itemId')
  @RequireScopes('pdv:sales:write')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateSaleItemDto, @Req() request: PdvRequest) {
    return this.sales.updateItem(request.pdvContext, id, itemId, dto);
  }

  @Patch(':id/discount')
  @RequireScopes('pdv:sales:write')
  applyDiscount(@Param('id') id: string, @Body() dto: ApplyDiscountDto, @Req() request: PdvRequest) {
    return this.sales.applyDiscount(request.pdvContext, id, dto);
  }

  @Post(':id/payments')
  @RequireScopes('pdv:sales:write')
  addPayment(@Param('id') id: string, @Body() dto: AddSalePaymentDto, @Req() request: PdvRequest) {
    return this.sales.addPayment(request.pdvContext, id, dto);
  }

  @Post(':id/payments/pix')
  @RequireScopes('pdv:sales:write')
  initiatePix(@Param('id') id: string, @Body() dto: InitiatePixPaymentDto, @Req() request: PdvRequest) {
    return this.sales.initiatePixPayment(request.pdvContext, id, dto.amount);
  }

  @Get(':id/payments/pix/:chargeId')
  @RequireScopes('pdv:sales:read')
  verifyPix(
    @Param('id') id: string,
    @Param('chargeId') chargeId: string,
    @Req() request: PdvRequest,
  ) {
    return this.sales.verifyPixPayment(request.pdvContext, id, chargeId);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequireScopes('pdv:sales:write')
  complete(@Param('id') id: string, @Body() dto: CompleteSaleDto, @Req() request: PdvRequest) {
    return this.sales.complete(request.pdvContext, id, dto);
  }

  @Post(':id/emit-nf')
  @HttpCode(200)
  @RequireScopes('pdv:sales:write')
  emitNf(@Param('id') id: string, @Body() dto: EmitNfDto, @Req() request: PdvRequest) {
    return this.sales.emitNf(request.pdvContext, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @RequireScopes('pdv:sales:write')
  cancel(@Param('id') id: string, @Body() dto: CancelSaleDto, @Req() request: PdvRequest) {
    return this.sales.cancel(request.pdvContext, id, dto);
  }
}
