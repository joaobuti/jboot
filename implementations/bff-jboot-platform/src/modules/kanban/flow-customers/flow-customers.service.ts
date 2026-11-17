import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CustomerJuridicoService } from '../../establishment-customers/customer-juridico.service';
import { CustomersService } from '../../establishment-customers/customers.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { ColumnsRepository } from '../columns/columns.repository';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { CardOfficePolicy } from '../offices/card-office.policy';
import { ActiveOfficeService, CUSTOMER_OFFICES_SCOPE } from '../offices/active-office.service';
import { OfficesRepository } from '../offices/offices.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import {
  CreateCardFromCustomerDto,
  CreateFlowCustomerDto,
  ListFlowCustomersQueryDto,
  LinkExistingCardDto,
  UpdateFlowCustomerDto
} from './dto/flow-customer.dto';
import { FlowCustomersRepository } from './flow-customers.repository';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { DEFAULT_DOCUMENT_REQUIREMENTS, missingCustomerDocumentTypes } from '../customer-documents/customer-document-catalog';
import { CustomerDocumentsRepository } from '../customer-documents/customer-documents.repository';
import { CustomerValidationRepository, ValidationRunRow } from '../customer-validation/customer-validation.repository';
import { CustomerValidationStatus, deriveStatus } from '../customer-validation/customer-validation-status';

const CUSTOMER_NOT_FOUND = { code: 'customer_not_found', message: 'Customer not found' } as const;

@Injectable()
export class FlowCustomersService {
  constructor(
    private readonly repository: FlowCustomersRepository,
    private readonly customers: CustomersService,
    private readonly juridico: CustomerJuridicoService,
    private readonly viewers: KanbanViewerResolver,
    private readonly offices: OfficesRepository,
    private readonly officePolicy: CardOfficePolicy,
    private readonly access: BoardAccessService,
    private readonly columns: ColumnsRepository,
    private readonly checklistGate: ChecklistGateService,
    private readonly audit: KanbanAuditService,
    private readonly cardVisibility: CardVisibilityService,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly customerDocuments: CustomerDocumentsRepository,
    private readonly validations: CustomerValidationRepository,
    private readonly activeOffice: ActiveOfficeService
  ) {}

  async list(context: KanbanRequestContext, query: ListFlowCustomersQueryDto, mutate: MutateContext) {
    const viewer = await this.viewers.resolve(context);
    const allowedIds = viewer.isAdmin
      ? null
      : await this.repository.listVisibleCustomerIds(context.databaseRef, context.clientId, viewer.officeIds);
    if (viewer.isAdmin) {
      await this.audit.record('kanban_flow_customers_global_read', mutate, null, { operation: 'list' });
    }
    const page = await this.customers.listForFlow(context.clientId, allowedIds, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      ...(query.search ? { search: query.search } : {})
    });
    const documentation = await this.documentation(context, page.data.map((customer) => customer.id));
    const data = await Promise.all(
      page.data.map(async (customer) => ({ ...(await this.toSummary(context, customer)), documentation: documentation.get(customer.id) }))
    );
    const [settings, officeSettings] = await Promise.all([
      this.validations.getSettings(context.databaseRef, context.clientId),
      this.validations.listOfficeSettings(context.databaseRef, context.clientId)
    ]);
    // Conta principal ou rotina de algum escritorio (ADR 018); a escolha final e no envio.
    const validationConfigured = Boolean(settings) || officeSettings.length > 0;
    return { data, page: query.page, pageSize: query.pageSize, total: page.meta.total, validationConfigured };
  }

  async get(context: KanbanRequestContext, customerId: string, mutate: MutateContext) {
    await this.requireVisible(context, customerId, mutate);
    return this.loadDetail(context, customerId);
  }

  async create(context: KanbanRequestContext, dto: CreateFlowCustomerDto, mutate: MutateContext) {
    // Sem permissao de escolher, o cliente vai para o escritorio ativo de quem cadastra
    // (flow-offices-sprints.md, S2); o que vier no pedido e ignorado.
    const viewer = await this.viewers.resolve(context);
    if (!canChooseCustomerOffices(context, viewer.isAdmin)) {
      dto.officeIds = [await this.activeOffice.require(context)];
    } else if (!dto.officeIds?.length) {
      throw new UnprocessableEntityException({ code: 'office_required', message: 'Choose the office of the customer' });
    }
    await this.requireOfficesWritable(context, dto.officeIds, false);
    let customer: Awaited<ReturnType<CustomersService['createForFlow']>>;
    try {
      customer = await this.customers.createForFlow(context.clientId, this.coreCreate(dto), mutate);
    } catch (error) {
      if ((error as { code?: string }).code === 'customer_document_conflict' || (error as { code?: string }).code === '23505') {
        throw new ConflictException({ code: 'customer_document_conflict', message: 'Document already registered' });
      }
      throw error;
    }
    try {
      if (dto.juridico) await this.juridico.save(context.clientId, customer.id, dto.juridico);
      await this.repository.replaceOffices(
        context.databaseRef,
        context.clientId,
        customer.id,
        dto.officeIds,
        context.identityId,
        'flow_customer'
      );
    } catch (error) {
      await this.customers.discardJustCreated(context.clientId, customer.id, mutate);
      throw error;
    }
    await this.audit.record('kanban_flow_customer_created', mutate, null, {
      customerId: customer.id,
      officeIds: dto.officeIds
    });
    return this.loadDetail(context, customer.id);
  }

  async update(context: KanbanRequestContext, customerId: string, dto: UpdateFlowCustomerDto, mutate: MutateContext) {
    await this.requireVisible(context, customerId, mutate);
    const hasOwnerChanges = ['name', 'documentNumber', 'email', 'phone', 'status', 'juridico'].some(
      (field) => dto[field as keyof UpdateFlowCustomerDto] !== undefined
    );
    if (dto.officeIds && hasOwnerChanges) {
      throw new BadRequestException({
        code: 'cross_database_patch_not_atomic',
        message: 'Change office links separately from customer data'
      });
    }
    const currentOffices = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId);
    if (dto.officeIds) {
      const changing = !sameIds(currentOffices.map((item) => item.officeId), dto.officeIds);
      await this.requireOfficesWritable(context, dto.officeIds, changing);
      await this.repository.replaceOffices(
        context.databaseRef,
        context.clientId,
        customerId,
        dto.officeIds,
        context.identityId,
        'admin',
        dto.officeLinkReason
      );
    }
    const core = this.coreUpdate(dto);
    if (Object.keys(core).length > 0) {
      try {
        await this.customers.updateForFlow(context.clientId, customerId, core, mutate);
      } catch (error) {
        if ((error as { code?: string }).code === 'customer_document_conflict' || (error as { code?: string }).code === '23505') {
          throw new ConflictException({ code: 'customer_document_conflict', message: 'Document already registered' });
        }
        throw error;
      }
    }
    if (dto.juridico) await this.juridico.save(context.clientId, customerId, dto.juridico);
    await this.audit.record('kanban_flow_customer_updated', mutate, null, {
      customerId,
      fields: [...Object.keys(core), ...(dto.juridico ? ['juridico'] : []), ...(dto.officeIds ? ['officeIds'] : [])]
    });
    return this.loadDetail(context, customerId);
  }

  async listCards(context: KanbanRequestContext, customerId: string, mutate: MutateContext) {
    await this.requireVisible(context, customerId, mutate);
    return this.repository.listVisibleCards(context.databaseRef, context.clientId, customerId, await this.viewers.resolve(context));
  }

  async createCard(
    context: KanbanRequestContext,
    customerId: string,
    idempotencyKey: string,
    dto: CreateCardFromCustomerDto,
    mutate: MutateContext
  ) {
    const customer = await this.requireVisible(context, customerId, mutate);
    if (customer.status !== 'active') {
      throw new UnprocessableEntityException({ code: 'customer_inactive', message: 'Customer is inactive' });
    }
    const links = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId);
    if (!links.some((link) => link.officeId === dto.officeId)) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    await this.access.requireBoard(context, dto.boardId);
    await this.access.requireRole(context, dto.boardId, ['board_admin', 'board_member']);
    const officeId = await this.officePolicy.resolveForNewCard(context, dto.officeId);
    if (officeId !== dto.officeId) throw new ForbiddenException('Office not allowed');
    const column = await this.columns.findById(context.databaseRef, context.clientId, dto.boardId, dto.columnId);
    if (!column || column.status !== 'active') throw new NotFoundException('Board column not found');
    await this.access.requireColumnEditable(context, dto.boardId, dto.columnId);
    await this.checklistGate.assertCanEnterColumn(context, dto.boardId, column, null);
    const requestHash = createHash('sha256')
      .update(JSON.stringify([customerId, dto.boardId, dto.columnId, dto.officeId, dto.title]))
      .digest('hex');
    const result = await this.repository.createCardFromCustomer(context.databaseRef, context.clientId, {
      idempotencyKey,
      requestHash,
      customerId,
      boardId: dto.boardId,
      columnId: dto.columnId,
      officeId: dto.officeId,
      title: dto.title,
      identityId: context.identityId,
      ip: mutate.ip,
      userAgent: mutate.userAgent
    });
    return result;
  }

  async linkExistingCard(
    context: KanbanRequestContext,
    customerId: string,
    cardId: string,
    dto: LinkExistingCardDto,
    mutate: MutateContext
  ) {
    const customer = await this.requireVisible(context, customerId, mutate);
    if (customer.status !== 'active') {
      throw new UnprocessableEntityException({ code: 'customer_inactive', message: 'Customer is inactive' });
    }
    await this.access.requireBoard(context, dto.boardId);
    await this.access.requireRole(context, dto.boardId, ['board_admin', 'board_member']);
    const card = await this.cardVisibility.requireVisibleCard(context, dto.boardId, cardId);
    await this.access.requireColumnEditable(context, dto.boardId, card.boardColumnId);
    if (!card.officeId) throw new ConflictException({ code: 'card_office_required', message: 'Card has no office' });
    const links = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId);
    if (!links.some((link) => link.officeId === card.officeId)) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    const current = await this.cardCustomers.findByCard(context.databaseRef, context.clientId, cardId);
    await this.repository.linkExistingCard(context.databaseRef, context.clientId, {
      customerId,
      boardId: dto.boardId,
      cardId,
      officeId: card.officeId,
      identityId: context.identityId,
      previousCustomerId: current?.customerId ?? null,
      ip: mutate.ip,
      userAgent: mutate.userAgent
    });
    return { cardId, customerId };
  }

  /** Mesma regra de visibilidade da ficha (escritorio ou flow:admin), para recursos do cliente. */
  /**
   * Escritorios do cliente que o usuario enxerga (admin: todos os vinculados), para a
   * escolha da conta Claude que valida os documentos (ADR 018).
   */
  async validationOffices(context: KanbanRequestContext, customerId: string): Promise<Array<{ id: string; name: string }>> {
    const viewer = await this.viewers.resolve(context);
    const links = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId);
    const ids = links.map((link) => link.officeId).filter((id) => viewer.isAdmin || viewer.officeIds.includes(id));
    if (ids.length === 0) return [];
    const offices = await this.offices.listByIds(context.databaseRef, context.clientId, ids);
    return offices.map((office) => ({ id: office.id, name: office.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  /**
   * `auditGlobalRead: false` so para chamadas do conector Claude: cada tool ja e auditada
   * com o run, e auditar a leitura global a cada pagina duplicaria o registro.
   */
  requireVisibleCustomer(
    context: KanbanRequestContext,
    customerId: string,
    mutate: MutateContext,
    options: { auditGlobalRead?: boolean } = {}
  ) {
    return this.requireVisible(context, customerId, mutate, options.auditGlobalRead ?? true);
  }

  private async requireVisible(context: KanbanRequestContext, customerId: string, mutate: MutateContext, auditGlobalRead = true) {
    const viewer = await this.viewers.resolve(context);
    const customer = await this.customers.findForFlowById(context.clientId, customerId);
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    if (viewer.isAdmin) {
      if (auditGlobalRead) {
        await this.audit.record('kanban_flow_customers_global_read', mutate, null, { operation: 'detail', customerId });
      }
      return customer;
    }
    const links = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId);
    if (!links.some((link) => viewer.officeIds.includes(link.officeId))) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    return customer;
  }

  private async requireOfficesWritable(context: KanbanRequestContext, officeIds: string[], adminOnly: boolean) {
    const viewer = await this.viewers.resolve(context);
    if (adminOnly && !canChooseCustomerOffices(context, viewer.isAdmin)) {
      throw new ForbiddenException('Only flow:admin or flow:customers:offices can change office links');
    }
    const offices = await this.offices.listByIds(context.databaseRef, context.clientId, officeIds);
    if (offices.length !== officeIds.length || offices.some((office) => !office.active)) throw new NotFoundException('Office not found');
    if (!viewer.isAdmin && officeIds.some((id) => !viewer.officeIds.includes(id))) throw new NotFoundException('Office not found');
  }

  private async loadDetail(context: KanbanRequestContext, customerId: string) {
    const customer = await this.customers.findForFlowById(context.clientId, customerId);
    if (!customer) throw new NotFoundException(CUSTOMER_NOT_FOUND);
    const [juridico, offices] = await Promise.all([
      this.juridico.get(context.clientId, customerId),
      this.repository.listActiveOffices(context.databaseRef, context.clientId, customerId)
    ]);
    return { ...detailProjection(customer), officeIds: offices.map((item) => item.officeId), juridico };
  }

  /**
   * Alertas da listagem (ADR 017): situacao da ficha por cliente da pagina, em
   * lote (3 consultas), com a mesma regra da etapa Validacao.
   */
  private async documentation(context: KanbanRequestContext, customerIds: string[]) {
    // Rotina que nao respondeu no prazo deixa de travar o "Validar" da lista (mesma regra da ficha).
    await this.validations.expireStaleForCustomers(context.databaseRef, context.clientId, customerIds);
    const [documents, profiles, runs] = await Promise.all([
      this.customerDocuments.listCurrentForCustomers(context.databaseRef, context.clientId, customerIds),
      this.customerDocuments.profilesForCustomers(context.databaseRef, context.clientId, customerIds),
      this.validations.listRecentForCustomers(context.databaseRef, context.clientId, customerIds)
    ]);
    const result = new Map<string, { status: CustomerValidationStatus; missingCount: number; latestVerdict: ValidationRunRow['verdict'] }>();
    for (const customerId of customerIds) {
      const current = documents.filter((row) => row.customerId === customerId);
      const customerRuns = runs.filter((run) => run.customerId === customerId);
      const requirements = profiles.get(customerId) ?? DEFAULT_DOCUMENT_REQUIREMENTS;
      const missing = missingCustomerDocumentTypes(new Set(current.map((row) => row.documentType)), requirements);
      result.set(customerId, {
        status: deriveStatus(missing.length === 0, customerRuns, current, requirements),
        missingCount: missing.length,
        latestVerdict: customerRuns[0]?.verdict ?? null
      });
    }
    return result;
  }

  private async toSummary(context: KanbanRequestContext, customer: Awaited<ReturnType<CustomersService['findForFlowById']>> & {}) {
    const offices = await this.repository.listActiveOffices(context.databaseRef, context.clientId, customer.id);
    return { ...summaryProjection(customer), officeIds: offices.map((item) => item.officeId) };
  }

  private coreCreate(dto: CreateFlowCustomerDto) {
    return { name: dto.name, documentNumber: dto.documentNumber, email: dto.email, phone: dto.phone };
  }

  private coreUpdate(dto: UpdateFlowCustomerDto) {
    const output: { name?: string; documentNumber?: string | null; email?: string | null; phone?: string | null; status?: string } = {};
    for (const key of ['name', 'documentNumber', 'email', 'phone', 'status'] as const) {
      if (dto[key] !== undefined) Object.assign(output, { [key]: dto[key] });
    }
    return output;
  }
}

function maskedDocument(documentNumber: string | null): string | null {
  const digits = documentNumber?.replace(/\D/g, '') ?? '';
  return digits.length > 4 ? `***${digits.slice(-4)}` : documentNumber;
}

function summaryProjection(customer: { id: string; name: string; documentNumber: string | null; status: string }) {
  return { id: customer.id, name: customer.name, maskedDocumentNumber: maskedDocument(customer.documentNumber), status: customer.status };
}

function detailProjection(customer: {
  id: string; name: string; documentNumber: string | null; email: string | null; phone: string | null; status: string;
}) {
  return { ...summaryProjection(customer), email: customer.email, phone: customer.phone };
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

/** Escolher o escritorio da ficha: `flow:admin` (admin master) ou `flow:customers:offices`. */
function canChooseCustomerOffices(context: KanbanRequestContext, isAdmin: boolean): boolean {
  return isAdmin || context.scopes.includes(CUSTOMER_OFFICES_SCOPE);
}
