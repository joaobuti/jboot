import { Module } from '@nestjs/common';
import { PdvAuditModule } from '../shared/pdv-audit/pdv-audit.module';
import { CustomerJuridicoRepository } from './customer-juridico.repository';
import { CustomerJuridicoService } from './customer-juridico.service';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [PdvAuditModule],
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService, CustomerJuridicoRepository, CustomerJuridicoService],
  exports: [CustomersService, CustomerJuridicoService]
})
export class EstablishmentCustomersModule {}
