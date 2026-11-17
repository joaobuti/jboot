import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { MutateContext, PageQuery } from '../pdv/admin/admin.types';
import { isValidCpf, normalizeCpf } from '../shared/documents/cpf';
import { PdvAuditService } from '../shared/pdv-audit/pdv-audit.service';
import { CustomerAddressFillInput } from './customer-address.types';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

/** Resultado de `createIfCpfAbsent`: criado agora ou ja existente (somente ids). */
export type CreateIfCpfAbsentResult = { created: true; id: string } | { created: false; existingIds: string[] };

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly audit: PdvAuditService,
    private readonly repository: CustomersRepository
  ) {}

  list(clientId: string, query: PageQuery) {
    return this.repository.list(clientId, query);
  }

  findById(clientId: string, id: string) {
    return this.repository.findById(clientId, id);
  }

  /** API interna do modulo para a fachada Flow, com projecao sem campos fiscais. */
  listForFlow(clientId: string, allowedIds: string[] | null, query: { limit: number; offset: number; search?: string }) {
    return this.repository.listForFlow(clientId, allowedIds, query);
  }

  findForFlowById(clientId: string, id: string) {
    return this.repository.findForFlowById(clientId, id);
  }

  async createForFlow(
    clientId: string,
    dto: { name: string; documentNumber?: string | null; email?: string | null; phone?: string | null },
    context: MutateContext
  ) {
    if (dto.documentNumber) {
      if (!isValidCpf(dto.documentNumber)) {
        throw new UnprocessableEntityException({ code: 'invalid_document_number', message: 'Document must be a valid CPF' });
      }
      const digits = normalizeCpf(dto.documentNumber);
      const existing = await this.findIdsByCpf(clientId, digits);
      if (existing.length > 0) {
        const error = new Error('customer_document_conflict') as Error & { code?: string };
        error.code = 'customer_document_conflict';
        throw error;
      }
      return this.create(clientId, { ...dto, documentNumber: digits }, context);
    }
    return this.create(clientId, dto, context);
  }

  async updateForFlow(
    clientId: string,
    id: string,
    dto: { name?: string; documentNumber?: string | null; email?: string | null; phone?: string | null; status?: string },
    context: MutateContext
  ) {
    let documentNumber = dto.documentNumber;
    if (documentNumber) {
      if (!isValidCpf(documentNumber)) {
        throw new UnprocessableEntityException({ code: 'invalid_document_number', message: 'Document must be a valid CPF' });
      }
      documentNumber = normalizeCpf(documentNumber);
      const existing = await this.findIdsByCpf(clientId, documentNumber);
      if (existing.some((candidate) => candidate !== id)) {
        const error = new Error('customer_document_conflict') as Error & { code?: string };
        error.code = 'customer_document_conflict';
        throw error;
      }
    }
    return this.update(clientId, id, { ...dto, ...(documentNumber !== undefined ? { documentNumber } : {}) }, context);
  }

  async create(clientId: string, dto: CreateCustomerDto, context: MutateContext) {
    const result = await this.repository.create(clientId, dto);
    await this.audit.record('pdv_customer_created', context, { customerId: result.id });
    return result;
  }

  async update(clientId: string, id: string, dto: UpdateCustomerDto, context: MutateContext) {
    const result = await this.repository.update(clientId, id, dto);
    await this.audit.record('pdv_customer_updated', context, { customerId: id });
    return result;
  }

  /**
   * Ids dos clientes do tenant com este CPF (comparacao so por digitos, inclui
   * valores legados com mascara). Nao devolve dado do cliente: o consumidor
   * decide a visibilidade e so depois chama `findById`.
   */
  findIdsByCpf(clientId: string, cpf: string): Promise<string[]> {
    const digits = normalizeCpf(cpf);
    if (digits.length !== 11) {
      return Promise.resolve([]);
    }
    return this.repository.findIdsByDocumentDigits(clientId, digits);
  }

  /**
   * Unicidade de CPF por tenant validada no servico (decisao de 2026-10-09 em
   * docs/product/flow-crm-leads-sprints.md): busca pelo CPF normalizado antes
   * de criar; se ja existe, nao cria e devolve so os ids existentes. Grava o
   * CPF somente com digitos. Corrida entre duas criacoes simultaneas e
   * resolvida pelo indice unico (client_id, document_number): a violacao vira
   * nova busca, nunca duplicata.
   */
  async createIfCpfAbsent(
    clientId: string,
    cpf: string,
    dto: Omit<CreateCustomerDto, 'documentNumber'>,
    context: MutateContext
  ): Promise<CreateIfCpfAbsentResult> {
    const digits = normalizeCpf(cpf);
    const existingIds = await this.findIdsByCpf(clientId, digits);
    if (existingIds.length > 0) {
      return { created: false, existingIds };
    }
    try {
      const created = await this.create(clientId, { ...dto, documentNumber: digits }, context);
      return { created: true, id: created.id };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return { created: false, existingIds: await this.findIdsByCpf(clientId, digits) };
    }
  }

  /**
   * Compensacao: desfaz um cliente criado NESTA requisicao por `createIfCpfAbsent`
   * quando o consumidor nao conseguiu concluir o passo seguinte (ex.: vinculo ao
   * card do Flow). Sem isso o cliente ficaria orfao, invisivel a todos e
   * bloqueado para novo vinculo. So apaga se o cliente for do `clientId` e nao
   * tiver dado de PDV (`customer_pdv`); nunca e chamado com id pre-existente.
   */
  /** Endereco do comprovante lido pela IA no Flow: substitui o da ficha (ver repositorio). */
  replaceAddressFromDocument(clientId: string, id: string, input: CustomerAddressFillInput) {
    return this.repository.replaceAddressFromDocument(clientId, id, input);
  }

  async discardJustCreated(clientId: string, id: string, context: MutateContext): Promise<boolean> {
    const deleted = await this.repository.deleteIfNoPdvData(clientId, id);
    if (deleted) {
      await this.audit.record('pdv_customer_discarded', context, { customerId: id });
    }
    return deleted;
  }

  /**
   * Resolve-ou-cria um cliente final por telefone/CPF, sem contexto de
   * staff/auditoria — usado pela abertura de sessao publica e anonima do
   * modulo `comanda`. Nome e derivado do documento/telefone informado
   * porque nao ha coleta de nome nesse fluxo (decisao registrada no
   * MODULE_CONTRACT.md do `comanda`).
   */
  async findOrCreatePublic(
    clientId: string,
    params: { documentNumber?: string | null; phone?: string | null }
  ) {
    const existing = await this.repository.findByDocumentOrPhone(clientId, params);
    if (existing) {
      return existing;
    }
    const name = params.documentNumber
      ? `Cliente ${params.documentNumber}`
      : `Cliente ${params.phone}`;
    return this.repository.createPublic(clientId, {
      name,
      documentNumber: params.documentNumber ?? null,
      phone: params.phone ?? null
    });
  }
}
