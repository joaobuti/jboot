import { Module } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { FiscalTokenService } from '../../../config/fiscal-token.service';
import { ComandaModule } from '../../comanda/comanda.module';
import { EstablishmentCustomersModule } from '../../establishment-customers/establishment-customers.module';
import { FiscalModule } from '../../fiscal/fiscal.module';
import { PdvAuditModule } from '../../shared/pdv-audit/pdv-audit.module';
import { CashierController } from './cashier/cashier.controller';
import { ComandaAdminController } from './comanda/comanda-admin.controller';
import { ComandaAdminRepository } from './comanda/comanda-admin.repository';
import { ComandaAdminService } from './comanda/comanda-admin.service';
import { ComandaMesasController } from './comanda/mesas/comanda-mesas.controller';
import { ComandaMesasRepository } from './comanda/mesas/comanda-mesas.repository';
import { ComandaMesasService } from './comanda/mesas/comanda-mesas.service';
import { ComandaSalaoController } from './comanda/salao/comanda-salao.controller';
import { ComandaSalaoRepository } from './comanda/salao/comanda-salao.repository';
import { ComandaSalaoService } from './comanda/salao/comanda-salao.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardRepository } from './dashboard/dashboard.repository';
import { DashboardService } from './dashboard/dashboard.service';
import { CashierRepository } from './cashier/cashier.repository';
import { CashierService } from './cashier/cashier.service';
import { FiscalConfigController } from './fiscal-config/fiscal-config.controller';
import { FiscalConfigRepository } from './fiscal-config/fiscal-config.repository';
import { FiscalConfigService } from './fiscal-config/fiscal-config.service';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryRepository } from './inventory/inventory.repository';
import { InventoryService } from './inventory/inventory.service';
import { OperatorsController } from './operators/operators.controller';
import { OperatorsRepository } from './operators/operators.repository';
import { OperatorsService } from './operators/operators.service';
import { FiscalIntegrationService } from './sales/fiscal-integration.service';
import { SalesController } from './sales/sales.controller';
import { SalesRepository } from './sales/sales.repository';
import { SalesService } from './sales/sales.service';
import { PaymentsIntegrationService } from './sales/payments-integration.service';
import { PaymentsController } from './payments/payments.controller';

@Module({
  // `ComandaModule` entra apenas pelo provider que ele exporta
  // (`ComandaJwtService`, emissao do QR de mesa da Sprint 7). Repositories do
  // lado publico continuam inacessiveis daqui.
  imports: [PdvAuditModule, EstablishmentCustomersModule, ComandaModule, FiscalModule],
  controllers: [
    CashierController,
    ComandaAdminController,
    ComandaMesasController,
    ComandaSalaoController,
    DashboardController,
    FiscalConfigController,
    InventoryController,
    OperatorsController,
    PaymentsController,
    SalesController
  ],
  providers: [
    AppConfigService,
    FiscalTokenService,
    CashierRepository,
    ComandaAdminRepository,
    ComandaAdminService,
    ComandaMesasRepository,
    ComandaMesasService,
    ComandaSalaoRepository,
    ComandaSalaoService,
    DashboardRepository,
    DashboardService,
    CashierService,
    FiscalConfigRepository,
    FiscalConfigService,
    InventoryRepository,
    InventoryService,
    OperatorsRepository,
    OperatorsService,
    SalesRepository,
    SalesService,
    FiscalIntegrationService,
    PaymentsIntegrationService
  ]
})
export class AdminModule {}
