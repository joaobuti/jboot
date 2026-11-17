import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { PaymentsIntegrationService } from '../sales/payments-integration.service';
import { CompleteRefundDto, ConfigureInfinitePayDto, RequestRefundDto } from './dto/payments.dto';

@ApiTags('pdv-payments')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsIntegrationService) {}

  @Get('provider-connection')
  @RequireScopes('pdv:sales:read')
  get(@Req() request: PdvRequest) {
    return this.payments.getInfinitePayConnection(request.pdvContext.clientId);
  }

  @Put('provider-connection')
  @RequireScopes('pdv:sales:write')
  configure(@Body() dto: ConfigureInfinitePayDto, @Req() request: PdvRequest) {
    return this.payments.configureInfinitePayConnection(request.pdvContext.clientId, {
      publicIdentifier: dto.publicIdentifier,
      ...(dto.secretRef ? { secretRef: dto.secretRef } : {}),
    });
  }

  @Get('refunds')
  @RequireScopes('pdv:sales:read')
  listRefunds(@Req() request: PdvRequest) {
    return this.payments.listRefunds(request.pdvContext.clientId);
  }

  @Get('reconciliation')
  @RequireScopes('pdv:sales:read')
  listReconciliation(@Req() request: PdvRequest) {
    return this.payments.listReconciliation(request.pdvContext.clientId);
  }

  @Post('refunds')
  @RequireScopes('pdv:sales:write')
  requestRefund(@Body() dto: RequestRefundDto, @Req() request: PdvRequest) {
    return this.payments.requestRefund({
      clientId: request.pdvContext.clientId,
      operatorIdentityId: request.pdvContext.identityId,
      chargeId: dto.chargeId,
      amountMinor: dto.amountMinor,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('refunds/:refundId/complete')
  @RequireScopes('pdv:sales:write')
  completeRefund(
    @Param('refundId') refundId: string,
    @Body() dto: CompleteRefundDto,
    @Req() request: PdvRequest,
  ) {
    return this.payments.completeRefund({
      clientId: request.pdvContext.clientId,
      operatorIdentityId: request.pdvContext.identityId,
      refundId,
      succeeded: dto.succeeded,
      resolutionNote: dto.resolutionNote,
    });
  }
}
