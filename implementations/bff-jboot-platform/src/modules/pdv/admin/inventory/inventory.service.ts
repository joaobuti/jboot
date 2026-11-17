import { Injectable } from '@nestjs/common';
import { InventoryBalanceQueryDto } from '../dto/common.dto';
import { MutateContext } from '../admin.types';
import { PdvAuditService } from '../../../shared/pdv-audit/pdv-audit.service';
import {
  CreateInventoryAdjustmentDto,
  CreateInventoryImportDto,
  CreateStockLocationDto,
  CreateStockTransferDto,
  InventoryImportQueryDto,
  UpdateStockLocationDto
} from './dto/inventory.dto';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly audit: PdvAuditService,
    private readonly repository: InventoryRepository
  ) {}

  listLocations(clientId: string) {
    return this.repository.listLocations(clientId);
  }

  async createLocation(clientId: string, dto: CreateStockLocationDto, context: MutateContext) {
    const result = await this.repository.createLocation(clientId, dto);
    await this.audit.record('pdv_stock_location_created', context, { locationId: result.id });
    return result;
  }

  async updateLocation(clientId: string, id: string, dto: UpdateStockLocationDto, context: MutateContext) {
    const result = await this.repository.updateLocation(clientId, id, dto);
    await this.audit.record('pdv_stock_location_updated', context, { locationId: id });
    return result;
  }

  listTransfers(clientId: string, query: { limit: number; offset: number; productId?: string; fromLocationId?: string; toLocationId?: string }) {
    return this.repository.listTransfers(clientId, query);
  }

  async createTransfer(clientId: string, dto: CreateStockTransferDto, context: MutateContext) {
    const result = await this.repository.createTransfer(clientId, dto, context.identityId);
    await this.audit.record('pdv_stock_transfer_created', context, { transferId: result.id, productId: result.productId });
    return result;
  }

  listBalances(clientId: string, query: InventoryBalanceQueryDto) {
    return this.repository.listBalances(clientId, query);
  }

  async createAdjustment(clientId: string, dto: CreateInventoryAdjustmentDto, context: MutateContext) {
    const result = await this.repository.createAdjustment(clientId, dto, context.identityId);
    await this.audit.record('pdv_inventory_adjusted', context, { movementId: result.id, productId: result.productId });
    return result;
  }

  listImports(clientId: string, query: InventoryImportQueryDto) {
    return this.repository.listImports(clientId, query);
  }

  getImport(clientId: string, importId: string) {
    return this.repository.getImport(clientId, importId);
  }

  async createImport(clientId: string, dto: CreateInventoryImportDto, context: MutateContext) {
    const result = await this.repository.createImport(clientId, dto, context.identityId);
    await this.audit.record('pdv_inventory_import_created', context, { inventoryImportId: result.id });
    return result;
  }

  async registerSaleMovements(
    clientId: string,
    saleId: string,
    items: Array<{ productId: string; quantity: string }>,
    identityId: string,
    operatorLocationId?: string
  ): Promise<void> {
    const locationId = operatorLocationId ?? await this.repository.findPrimaryStockLocation(clientId);
    if (!locationId) return;
    const trackableIds = await this.repository.findTrackableProductIds(clientId, items.map((i) => i.productId));
    const trackableItems = items.filter((i) => trackableIds.has(i.productId));
    if (trackableItems.length === 0) return;
    await this.repository.writeSaleMovements(clientId, saleId, trackableItems, locationId, identityId);
  }

  async registerSaleRefundMovements(
    clientId: string,
    saleId: string,
    items: Array<{ productId: string; quantity: string }>,
    identityId: string,
    operatorLocationId?: string
  ): Promise<void> {
    const locationId = operatorLocationId ?? await this.repository.findPrimaryStockLocation(clientId);
    if (!locationId) return;
    const trackableIds = await this.repository.findTrackableProductIds(clientId, items.map((i) => i.productId));
    const trackableItems = items.filter((i) => trackableIds.has(i.productId));
    if (trackableItems.length === 0) return;
    await this.repository.writeSaleRefundMovements(clientId, saleId, trackableItems, locationId, identityId);
  }
}
