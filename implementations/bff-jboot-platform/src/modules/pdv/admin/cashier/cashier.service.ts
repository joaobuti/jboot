import { Injectable } from '@nestjs/common';
import { MutateContext, PdvRequestContext } from '../admin.types';
import { SalesRepository } from '../sales/sales.repository';
import { PdvAuditService } from '../../../shared/pdv-audit/pdv-audit.service';
import { CashierRepository, CashierRow, CashierSummary } from './cashier.repository';
import { CloseCashierDto, CreateCashierMovementDto, OpenCashierDto } from './dto/cashier.dto';

@Injectable()
export class CashierService {
  constructor(
    private readonly repository: CashierRepository,
    private readonly salesRepository: SalesRepository,
    private readonly audit: PdvAuditService
  ) {}

  async open(context: MutateContext, dto: OpenCashierDto): Promise<CashierRow> {
    const cashier = await this.repository.open(
      context.clientId,
      context.identityId,
      dto.openingBalance,
      dto.notes,
      context.locationId
    );
    await this.audit.record('cashier:opened', context, {
      cashierId: cashier.id,
      openingBalance: dto.openingBalance
    });
    return cashier;
  }

  async findOpen(context: PdvRequestContext): Promise<CashierRow[]> {
    return this.repository.findOpen(context.clientId, context.identityId);
  }

  async getSummary(context: PdvRequestContext, cashierId: string): Promise<CashierSummary> {
    return this.repository.getSummary(context.clientId, cashierId);
  }

  async createMovement(context: MutateContext, cashierId: string, dto: CreateCashierMovementDto) {
    const movement = await this.repository.createMovement(
      context.clientId,
      cashierId,
      context.identityId,
      dto.type,
      dto.amount,
      dto.reason.trim()
    );
    await this.audit.record('cashier:movement', context, {
      cashierId,
      movementId: movement.id,
      type: dto.type,
      amount: dto.amount
    });
    return movement;
  }

  async close(context: MutateContext, cashierId: string, dto: CloseCashierDto): Promise<CashierRow> {
    await this.salesRepository.cancelByCashier(context.clientId, cashierId);
    const expectedClosingBalance = await this.repository.calcExpectedClosingBalance(context.clientId, cashierId);
    const cashier = await this.repository.close(context.clientId, cashierId, expectedClosingBalance, dto.countedBalance, dto.notes);
    await this.audit.record('cashier:closed', context, {
      cashierId,
      expectedClosingBalance,
      countedBalance: dto.countedBalance,
      closingDifference: Number(cashier.closingDifference ?? 0)
    });
    return cashier;
  }
}
