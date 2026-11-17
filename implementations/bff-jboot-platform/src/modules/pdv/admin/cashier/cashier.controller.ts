import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CashierService } from './cashier.service';
import { CloseCashierDto, CreateCashierMovementDto, OpenCashierDto } from './dto/cashier.dto';

@ApiTags('pdv-cashier')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/cashiers')
export class CashierController {
  constructor(private readonly cashier: CashierService) {}

  @Post('open')
  @RequireScopes('pdv:cashier:write')
  open(@Body() dto: OpenCashierDto, @Req() request: PdvRequest) {
    return this.cashier.open(buildMutateContext(request), dto);
  }

  @Get('current')
  @RequireScopes('pdv:cashier:read')
  current(@Req() request: PdvRequest) {
    return this.cashier.findOpen(request.pdvContext);
  }

  @Get(':id/summary')
  @RequireScopes('pdv:cashier:read')
  summary(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.cashier.getSummary(request.pdvContext, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequireScopes('pdv:cashier:write')
  close(@Param('id') id: string, @Body() dto: CloseCashierDto, @Req() request: PdvRequest) {
    return this.cashier.close(buildMutateContext(request), id, dto);
  }

  @Post(':id/movements')
  @RequireScopes('pdv:cashier:write')
  createMovement(@Param('id') id: string, @Body() dto: CreateCashierMovementDto, @Req() request: PdvRequest) {
    return this.cashier.createMovement(buildMutateContext(request), id, dto);
  }
}
