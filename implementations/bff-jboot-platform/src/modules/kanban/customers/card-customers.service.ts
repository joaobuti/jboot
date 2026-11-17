import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { CustomerJuridicoService } from '../../establishment-customers/customer-juridico.service';
import { CustomersService } from '../../establishment-customers/customers.service';
import { ActivitiesRepository } from '../activities/activities.repository';
import { CardRow } from '../cards/cards.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { LeadEditLock } from '../leads/lead-edit-lock.service';
import { BoardAccessService } from '../shared/board-access.service';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardCustomersRepository } from './card-customers.repository';
import {
  CardCustomerCoreUpdateDto,
  CardCustomerJuridicoDto,
  CardCustomerJuridicoView,
  CardCustomerLinkResponse,
  CardCustomerLookupResponse,
  CardCustomerPanelResponse,
  CardCustomerView,
  LinkCardCustomerDto,
  UpdateCardCustomerDto
} from './dto/card-customer.dto';

type CardEntity = Omit<CardRow, 'total'>;

/** Resultado interno da resolucao por CPF; so `visible` carrega id, e nunca sai daqui sem dados checados. */
export type CpfResolution = { kind: 'not_found' } | { kind: 'outside_boards' } | { kind: 'visible'; customerId: string };

const CORE_FIELDS = [
  'name',
  'email',
  'phone',
  'addressZip',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressNeighborhood',
  'addressCity',
  'addressState'
] as const satisfies ReadonlyArray<keyof CardCustomerCoreUpdateDto>;

const JURIDICO_FIELDS = [
  'dataNascimento',
  'nacionalidade',
  'estadoCivil',
  'profissao',
  'rgNumero',
  'rgOrgaoEmissor',
  'rgUf',
  'nomeMae',
  'numeroBeneficio',
  'especieBeneficio',
  'bancoPagamento',
  'hipossuficienciaDeclarada',
  'observacoes'
] as const satisfies ReadonlyArray<keyof CardCustomerJuridicoDto & keyof CardCustomerJuridicoView>;

const EMPTY_JURIDICO: CardCustomerJuridicoView = {
  dataNascimento: null,
  nacionalidade: null,
  estadoCivil: null,
  profissao: null,
  rgNumero: null,
  rgOrgaoEmissor: null,
  rgUf: null,
  nomeMae: null,
  numeroBeneficio: null,
  especieBeneficio: null,
  bancoPagamento: null,
  hipossuficienciaDeclarada: false,
  observacoes: null
};

export const CUSTOMER_OUTSIDE_BOARDS = {
  code: 'customer_outside_boards',
  message: 'Cliente cadastrado fora dos seus quadros'
} as const;

export { FLOW_ADMIN_SCOPE };

export const OVERRIDE_NOT_ALLOWED = {
  code: 'override_not_allowed',
  message: 'Only a Flow tenant admin (flow:admin) can link a customer registered outside your boards'
} as const;

/** Sprint 3.5 (P30): cliente ja tem card so em outro(s) escritorio(s); so o admin vincula, com motivo. */
export const CROSS_OFFICE_LINK_REQUIRES_ADMIN = {
  code: 'cross_office_link_requires_admin',
  message: 'Customer belongs to another office. Contact the administrator.'
} as const;

export const CROSS_OFFICE_OVERRIDE_REQUIRED = {
  code: 'cross_office_override_required',
  message: 'Linking a customer of another office requires an override reason'
} as const;

export const OVERRIDE_REQUIRES_EXISTING_CUSTOMER = {
  code: 'override_requires_existing_customer',
  message: 'Override only links an existing customer; no customer was found for this CPF'
} as const;

interface ResolvedCustomer {
  customerId: string;
  created: boolean;
  /** Vinculo de cliente fora dos quadros pelo override do `flow:admin`. */
  overridden: boolean;
  /** Vinculo que amplia o cadastro para outro escritorio (P30), so com override do admin. */
  crossOffice: boolean;
}

/**
 * Cliente final titular do card (CRM de leads, Sprint 1). Regras:
 * - dado do cliente vem SOMENTE dos servicos exportados por
 *   `establishment-customers` (nunca SQL nas tabelas de cliente);
 * - o usuario so ve dado de cliente vinculado a card nao excluido de quadro em
 *   que e membro ativo; a checagem roda no banco do Flow ANTES de qualquer
 *   leitura de dado do cliente;
 * - cliente existente fora dos quadros do usuario nao e exibido, vinculado nem
 *   duplicado (decisao de 2026-10-09), exceto pelo override explicito do
 *   `flow:admin` com motivo (decisao de 2026-10-11, Sprint 3), que so vincula
 *   cliente existente e nunca exibe dado antes do vinculo;
 * - CPF e dado pessoal nunca vao para log, auditoria ou `system_event`.
 */
@Injectable()
export class CardCustomersService {
  private readonly logger = new Logger(CardCustomersService.name);

  constructor(
    private readonly repository: CardCustomersRepository,
    private readonly visibility: CardVisibilityService,
    private readonly activities: ActivitiesRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService,
    private readonly customers: CustomersService,
    private readonly juridico: CustomerJuridicoService,
    private readonly leadLock: LeadEditLock
  ) {}

  /** Painel "Cliente": membro ativo do quadro do card (qualquer papel) com o card visivel. */
  async getPanel(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardCustomerPanelResponse> {
    await this.access.requireBoard(context, boardId);
    await this.access.resolveMembership(context, boardId);
    const card = await this.requireCard(context, boardId, cardId);
    return this.buildPanel(context, boardId, card);
  }

  async lookup(context: KanbanRequestContext, boardId: string, cardId: string, cpf: string): Promise<CardCustomerLookupResponse> {
    const card = await this.requireEditableCard(context, boardId, cardId);
    const resolution = await this.resolveByCpf(context, cpf);
    if (resolution.kind === 'outside_boards') {
      // Sem dado do cliente mesmo para o admin: so a indicacao de que o override existe.
      return isFlowAdmin(context) ? { status: 'outside_boards', canOverride: true } : { status: 'outside_boards' };
    }
    if (resolution.kind !== 'visible') {
      return { status: resolution.kind };
    }
    const customer = await this.loadCustomer(context.clientId, resolution.customerId);
    if (!customer) {
      return { status: 'not_found' };
    }
    if (await this.isCrossOffice(context, card, resolution.customerId)) {
      return isFlowAdmin(context)
        ? { status: 'found', customer, crossOffice: true, canOverride: true }
        : { status: 'found', customer, crossOffice: true };
    }
    return { status: 'found', customer };
  }

  async link(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: LinkCardCustomerDto,
    mutate: MutateContext
  ): Promise<CardCustomerLinkResponse> {
    const card = await this.requireEditableCard(context, boardId, cardId);
    // Lead enviado: vinculo/troca do cliente pelo card congelados ate a devolucao (P21, PE10).
    await this.leadLock.assertEditable(context, cardId);
    // Antes de qualquer busca: sem `flow:admin` o override nem chega a resolver o CPF.
    if (dto.override && !isFlowAdmin(context)) {
      throw new ForbiddenException(OVERRIDE_NOT_ALLOWED);
    }
    const resolved = await this.resolveOrCreate(context, dto, mutate);
    const { customerId, created } = resolved;
    let { overridden } = resolved;
    // P30 (Sprint 3.5): levar a outro escritorio um cliente que ja tem card exige o admin com motivo.
    const crossOffice = !created && (await this.isCrossOffice(context, card, customerId));
    if (crossOffice) {
      if (!isFlowAdmin(context)) {
        throw new ConflictException(CROSS_OFFICE_LINK_REQUIRES_ADMIN);
      }
      if (!dto.override) {
        throw new ConflictException(CROSS_OFFICE_OVERRIDE_REQUIRED);
      }
      overridden = true;
    }

    const current = await this.repository.findByCard(context.databaseRef, context.clientId, cardId);
    if (current?.customerId === customerId) {
      return { outcome: 'unchanged', ...(await this.buildPanel(context, boardId, card)) };
    }

    let previousCustomerId: string | null;
    try {
      ({ previousCustomerId } = await this.repository.replace(
        context.databaseRef,
        context.clientId,
        cardId,
        customerId,
        context.identityId
      ));
    } catch (error) {
      if (created) {
        await this.discardCreatedCustomer(context.clientId, customerId, mutate);
      }
      throw error;
    }

    const kind = previousCustomerId ? 'card.customer_changed' : 'card.customer_linked';
    // Override: o motivo digitado e o unico texto livre do evento/auditoria (sem CPF, sem dado do cliente).
    const overrideFields =
      overridden && dto.override
        ? { override: true, reason: dto.override.reason, ...(crossOffice ? { crossOffice: true } : {}) }
        : {};
    const payload = previousCustomerId
      ? { customerId, previousCustomerId, created, ...overrideFields }
      : { customerId, created, ...overrideFields };
    await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, kind, payload);
    await this.audit.record(`kanban_${kind.replace('.', '_')}`, mutate, boardId, { cardId, ...payload });

    // Depois do vinculo: falha aqui NAO desfaz o vinculo (cliente ja visivel e
    // editavel pelo PATCH); o erro segue para o chamador.
    if (created && dto.juridico) {
      await this.juridico.save(context.clientId, customerId, pickDefined(dto.juridico, JURIDICO_FIELDS));
    }

    return { outcome: created ? 'created' : 'linked', ...(await this.buildPanel(context, boardId, card)) };
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: UpdateCardCustomerDto,
    mutate: MutateContext
  ): Promise<CardCustomerPanelResponse> {
    const card = await this.requireEditableCard(context, boardId, cardId);
    // Lead enviado: edicao do cliente pelo card congelada ate a devolucao (P21, PE10).
    await this.leadLock.assertEditable(context, cardId);
    const link = await this.repository.findByCard(context.databaseRef, context.clientId, cardId);
    if (!link) {
      throw new NotFoundException({ code: 'card_customer_not_linked', message: 'Card has no linked customer' });
    }
    const current = await this.customers.findById(context.clientId, link.customerId);
    if (!current) {
      throw new NotFoundException({ code: 'customer_not_found', message: 'Customer not found' });
    }
    const currentJuridico = (await this.juridico.get(context.clientId, link.customerId)) ?? EMPTY_JURIDICO;

    const coreChanges = changedFields<CardCustomerCoreUpdateDto, (typeof CORE_FIELDS)[number]>(
      dto.customer ?? {},
      current,
      CORE_FIELDS,
      { ignoreNull: true }
    );
    const juridicoChanges = changedFields<CardCustomerJuridicoDto, (typeof JURIDICO_FIELDS)[number]>(
      dto.juridico ?? {},
      currentJuridico,
      JURIDICO_FIELDS,
      { ignoreNull: false }
    );

    if (Object.keys(coreChanges).length > 0) {
      await this.customers.update(context.clientId, link.customerId, coreChanges, mutate);
    }
    if (Object.keys(juridicoChanges).length > 0) {
      await this.juridico.save(context.clientId, link.customerId, juridicoChanges);
    }

    const fields = [...Object.keys(coreChanges), ...Object.keys(juridicoChanges).map((field) => `juridico.${field}`)];
    if (fields.length > 0) {
      const payload = { customerId: link.customerId, fields };
      await this.activities.createSystemEvent(
        context.databaseRef,
        context.clientId,
        cardId,
        mutate.identityId,
        'card.customer_updated',
        payload
      );
      await this.audit.record('kanban_card_customer_updated', mutate, boardId, { cardId, ...payload });
    }

    return this.buildPanel(context, boardId, card);
  }

  /**
   * CPF -> ids (servico de clientes, so ids) -> visibilidade (banco do Flow).
   * Nenhum dado de cliente e lido aqui.
   */
  async resolveByCpf(context: KanbanRequestContext, cpf: string): Promise<CpfResolution> {
    const ids = await this.customers.findIdsByCpf(context.clientId, cpf);
    if (ids.length === 0) {
      return { kind: 'not_found' };
    }
    return this.resolveVisible(context, ids);
  }

  private async resolveVisible(context: KanbanRequestContext, ids: string[]): Promise<CpfResolution> {
    // Escopo unico de visibilidade (Sprint 3.5): cliente visivel = card visivel vinculado.
    const visible = await this.repository.filterVisibleCustomerIds(
      context.databaseRef,
      context.clientId,
      await this.visibility.resolveViewer(context),
      ids
    );
    return visible.length > 0 ? { kind: 'visible', customerId: visible[0] } : { kind: 'outside_boards' };
  }

  /**
   * Resolve o cliente do vinculo. Override (`dto.override`, ja autorizado pelo
   * chamador) so muda o desfecho de `outside_boards`: usa o PRIMEIRO id por
   * ordem de criacao (`findIdsByCpf` ordena por `created_at, id`; mesma regra
   * de duplicidade legada da resolucao normal), sem escolha entre ids. CPF sem
   * cliente com override responde 422 e nunca cria; cliente visivel ignora o
   * override (vinculo normal, sem marca de override no evento).
   */
  private async resolveOrCreate(
    context: KanbanRequestContext,
    dto: LinkCardCustomerDto,
    mutate: MutateContext
  ): Promise<ResolvedCustomer> {
    let ids = await this.customers.findIdsByCpf(context.clientId, dto.cpf);
    if (ids.length === 0) {
      if (dto.override) {
        throw new UnprocessableEntityException(OVERRIDE_REQUIRES_EXISTING_CUSTOMER);
      }
      if (!dto.customer) {
        throw new UnprocessableEntityException({
          code: 'customer_data_required',
          message: 'Customer data is required to register a new CPF'
        });
      }
      const result = await this.customers.createIfCpfAbsent(
        context.clientId,
        dto.cpf,
        pickDefined(dto.customer, CORE_FIELDS) as typeof dto.customer,
        mutate
      );
      if (result.created) {
        return { customerId: result.id, created: true, overridden: false, crossOffice: false };
      }
      ids = result.existingIds;
    }
    const resolution = await this.resolveVisible(context, ids);
    if (resolution.kind === 'visible') {
      return { customerId: resolution.customerId, created: false, overridden: false, crossOffice: false };
    }
    if (!dto.override || ids.length === 0) {
      throw new ConflictException(CUSTOMER_OUTSIDE_BOARDS);
    }
    return { customerId: ids[0], created: false, overridden: true, crossOffice: false };
  }

  /**
   * Compensacao do cliente criado nesta requisicao quando o vinculo falha (os
   * bancos sao distintos, sem transacao unica). Falha da propria compensacao so
   * e logada (ids apenas, sem CPF/dado pessoal); o erro original e propagado
   * pelo chamador.
   */
  private async discardCreatedCustomer(clientId: string, customerId: string, mutate: MutateContext): Promise<void> {
    try {
      const discarded = await this.customers.discardJustCreated(clientId, customerId, mutate);
      if (!discarded) {
        this.logger.error(JSON.stringify({ event: 'card_customer_compensation_skipped', clientId, customerId }));
      }
    } catch {
      this.logger.error(JSON.stringify({ event: 'card_customer_compensation_failed', clientId, customerId }));
    }
  }

  private async buildPanel(context: KanbanRequestContext, boardId: string, card: CardEntity): Promise<CardCustomerPanelResponse> {
    const [link, canEdit] = await Promise.all([
      this.repository.findByCard(context.databaseRef, context.clientId, card.id),
      this.canEdit(context, boardId, card)
    ]);
    if (!link) {
      return { customer: null, link: null, canEdit };
    }
    const customer = await this.loadCustomer(context.clientId, link.customerId);
    return {
      customer,
      link: { createdByIdentityId: link.createdByIdentityId, createdAt: link.createdAt },
      canEdit
    };
  }

  private async loadCustomer(clientId: string, customerId: string): Promise<CardCustomerView | null> {
    const [core, juridico] = await Promise.all([
      this.customers.findById(clientId, customerId),
      this.juridico.get(clientId, customerId)
    ]);
    if (!core) {
      return null;
    }
    return {
      id: core.id,
      name: core.name,
      documentNumber: core.documentNumber,
      email: core.email,
      phone: core.phone,
      status: core.status,
      addressZip: core.addressZip,
      addressStreet: core.addressStreet,
      addressNumber: core.addressNumber,
      addressComplement: core.addressComplement,
      addressNeighborhood: core.addressNeighborhood,
      addressCity: core.addressCity,
      addressState: core.addressState,
      juridico: juridico ? pickAll(juridico, JURIDICO_FIELDS) : null
    };
  }

  private async canEdit(context: KanbanRequestContext, boardId: string, card: CardEntity): Promise<boolean> {
    if (!context.scopes.includes('flow:write')) {
      return false;
    }
    try {
      await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
      await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
    return this.leadLock.isEditable(context, card.id);
  }

  /** Mesma regra das mutacoes de card (`CardsService.update`). */
  private async requireEditableCard(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardEntity> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const card = await this.requireCard(context, boardId, cardId);
    await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
    return card;
  }

  /** Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404. */
  private async requireCard(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardEntity> {
    return this.visibility.requireVisibleCard(context, boardId, cardId);
  }

  /** P30: so com a chave ligada e card com escritorio; cliente com card(s) so em outro(s) escritorio(s). */
  private async isCrossOffice(context: KanbanRequestContext, card: CardEntity, customerId: string): Promise<boolean> {
    if (!card.officeId) {
      return false;
    }
    const viewer = await this.visibility.resolveViewer(context);
    if (!viewer.officeVisibilityEnabled) {
      return false;
    }
    return this.repository.isCrossOfficeLink(context.databaseRef, context.clientId, customerId, card.officeId, card.id);
  }
}

function isFlowAdmin(context: KanbanRequestContext): boolean {
  return context.scopes.includes(FLOW_ADMIN_SCOPE);
}

function pickDefined<T extends object, K extends keyof T>(source: T, fields: readonly K[]): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
}

function pickAll<T extends object, K extends keyof T>(source: T, fields: readonly K[]): Pick<T, K> {
  return Object.fromEntries(fields.map((field) => [field, source[field]])) as Pick<T, K>;
}

/**
 * Campos enviados cujo valor difere do atual. `ignoreNull` trata `null` como
 * "nao alterar" (dado geral do nucleo, semantica COALESCE do servico).
 */
export function changedFields<T extends object, K extends keyof T>(
  input: Partial<T>,
  current: object,
  fields: readonly K[],
  options: { ignoreNull: boolean }
): Partial<Pick<T, K>> {
  const currentValues = current as Partial<Record<K, unknown>>;
  const result: Partial<Pick<T, K>> = {};
  for (const field of fields) {
    const value = input[field];
    if (value === undefined || (options.ignoreNull && value === null)) {
      continue;
    }
    if (value !== (currentValues[field] ?? null)) {
      result[field] = value;
    }
  }
  return result;
}
