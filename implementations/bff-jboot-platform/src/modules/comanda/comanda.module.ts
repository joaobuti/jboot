import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { EstablishmentCustomersModule } from '../establishment-customers/establishment-customers.module';
import { ComandaSessionController } from './public/comanda-session.controller';
import { ComandaOrderController } from './public/comanda-order.controller';
import { ComandaSessionGuard } from './guards/comanda-session.guard';
import { ComandaJwtService } from './services/comanda-jwt.service';
import { ComandaSessionService } from './services/comanda-session.service';
import { ComandaOrderService } from './services/comanda-order.service';
import { ComandaTablesRepository } from './repositories/comanda-tables.repository';
import { ComandasRepository } from './repositories/comandas.repository';
import { ComandaPedidosRepository } from './repositories/comanda-pedidos.repository';
import { ComandaProductsRepository } from './repositories/comanda-products.repository';

/**
 * Lado cliente (publico, sem Identity Hub) do modulo `comanda` — Sprint 2:
 * abertura de comanda, sessao do cliente, envio de pedidos. Triagem/filas/
 * fechamento pelo staff vivem em `AdminModule` do `pdv` (fora deste modulo).
 * Ver modules/comanda/MODULE_CONTRACT.md.
 */
@Module({
  imports: [EstablishmentCustomersModule],
  controllers: [ComandaSessionController, ComandaOrderController],
  providers: [
    AppConfigService,
    ComandaJwtService,
    ComandaSessionGuard,
    ComandaSessionService,
    ComandaOrderService,
    ComandaTablesRepository,
    ComandasRepository,
    ComandaPedidosRepository,
    ComandaProductsRepository
  ],
  // Unico provider exportado: a emissao/validacao do QR de mesa (Sprint 7).
  // O `AdminModule` do pdv precisa emitir o QR no cadastro de mesas e nao
  // pode duplicar o segredo nem o formato do payload. Repositories continuam
  // privados — o acoplamento proibido pelo contrato e o de acesso a dado.
  exports: [ComandaJwtService]
})
export class ComandaModule {}
