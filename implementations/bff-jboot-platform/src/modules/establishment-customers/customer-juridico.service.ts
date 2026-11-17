import { Injectable } from '@nestjs/common';
import { CustomerJuridicoRepository } from './customer-juridico.repository';
import { CustomerJuridico, CustomerJuridicoFillInput, CustomerJuridicoInput } from './customer-juridico.types';

/**
 * Leitura/gravacao de `customer_juridico` (ADR 013). Unico ponto de acesso a
 * tabela; consumidores (ex.: kanban/Flow) usam este servico exportado pelo
 * modulo. Sem endpoint HTTP. Toda operacao exige `clientId` e valida que o
 * cliente final pertence a esse tenant.
 */
@Injectable()
export class CustomerJuridicoService {
  constructor(private readonly repository: CustomerJuridicoRepository) {}

  /** `null` quando o cliente nao tem dado juridico (ou pertence a outro tenant). */
  get(clientId: string, customerId: string): Promise<CustomerJuridico | null> {
    return this.repository.findByCustomerId(clientId, customerId);
  }

  /** Upsert parcial; NotFoundException se o cliente nao existe no `clientId`. */
  save(clientId: string, customerId: string, input: CustomerJuridicoInput): Promise<CustomerJuridico> {
    return this.repository.upsert(clientId, customerId, input);
  }

  /** So campos vazios recebem valor (a ficha prevalece); devolve os campos preenchidos. */
  fillEmpty(clientId: string, customerId: string, input: CustomerJuridicoFillInput) {
    return this.repository.fillEmpty(clientId, customerId, input);
  }
}
