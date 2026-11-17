import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { InventoryBalanceQueryDto, PaginationQueryDto } from '../dto/common.dto';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import {
  CreateInventoryAdjustmentDto,
  CreateInventoryImportDto,
  CreateStockLocationDto,
  CreateStockTransferDto,
  InventoryImportQueryDto,
  UpdateStockLocationDto
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

class StockTransferQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID()
  productId?: string;

  @IsOptional() @IsUUID()
  fromLocationId?: string;

  @IsOptional() @IsUUID()
  toLocationId?: string;
}

@ApiTags('pdv-admin-inventory')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/admin')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock-locations')
  @RequireScopes('pdv:inventory:read')
  listLocations(@Req() request: PdvRequest) {
    return this.inventory.listLocations(request.pdvContext.clientId);
  }

  @Post('stock-locations')
  @RequireScopes('pdv:inventory:write')
  createLocation(@Body() dto: CreateStockLocationDto, @Req() request: PdvRequest) {
    return this.inventory.createLocation(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Patch('stock-locations/:id')
  @RequireScopes('pdv:inventory:write')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateStockLocationDto, @Req() request: PdvRequest) {
    return this.inventory.updateLocation(request.pdvContext.clientId, id, dto, buildMutateContext(request));
  }

  @Get('stock-transfers')
  @RequireScopes('pdv:inventory:read')
  listTransfers(@Query() query: StockTransferQueryDto, @Req() request: PdvRequest) {
    return this.inventory.listTransfers(request.pdvContext.clientId, query);
  }

  @Post('stock-transfers')
  @RequireScopes('pdv:inventory:write')
  createTransfer(@Body() dto: CreateStockTransferDto, @Req() request: PdvRequest) {
    return this.inventory.createTransfer(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Get('inventory-balances')
  @RequireScopes('pdv:inventory:read')
  listBalances(@Query() query: InventoryBalanceQueryDto, @Req() request: PdvRequest) {
    return this.inventory.listBalances(request.pdvContext.clientId, query);
  }

  @Post('inventory-adjustments')
  @RequireScopes('pdv:inventory:write')
  createAdjustment(@Body() dto: CreateInventoryAdjustmentDto, @Req() request: PdvRequest) {
    return this.inventory.createAdjustment(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Get('inventory-imports')
  @RequireScopes('pdv:inventory:read')
  listImports(@Query() query: InventoryImportQueryDto, @Req() request: PdvRequest) {
    return this.inventory.listImports(request.pdvContext.clientId, query);
  }

  @Post('inventory-imports')
  @RequireScopes('pdv:inventory:write')
  createImport(@Body() dto: CreateInventoryImportDto, @Req() request: PdvRequest) {
    return this.inventory.createImport(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Get('inventory-imports/:inventoryImportId')
  @RequireScopes('pdv:inventory:read')
  getImport(@Param('inventoryImportId') inventoryImportId: string, @Req() request: PdvRequest) {
    return this.inventory.getImport(request.pdvContext.clientId, inventoryImportId);
  }
}
