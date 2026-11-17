import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../../establishment-customers/customers.service';
import { formatCnj } from '../../shared/documents/cnj';
import { ActivitiesRepository } from '../activities/activities.repository';
import { BoardsRepository } from '../boards/boards.repository';
import { CardsService } from '../cards/cards.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { FlowCustomersRepository } from '../flow-customers/flow-customers.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { OfficesRepository } from '../offices/offices.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import { ValidatedRow } from './process-import-rows';
import { IMPORT_SOURCE, ImportLotRow, ImportRowRecord, NewImportRow, ProcessImportRepository, ProcessOwner } from './process-import.repository';

/** Cliente pelo CPF na conferencia: so diz "existente" quando o usuario enxerga a ficha (CPF nao e oraculo). */
export type CustomerMatch = { kind: 'new' } | { kind: 'existing'; nameDiffers: boolean } | { kind: 'unknown' };

export type RowOutcome =
  | { status: 'existing'; owner: ProcessOwner }
  | { status: 'created'; cardId: string; customerId: string; skippedAssignees: number };

/**
 * Lado Kanban da importacao de processos por planilha (docs/product/flow-process-import-sprints.md):
 * autoriza board/escritorio, confere numeros e clientes, grava o lote e cria cliente/card/responsaveis
 * de cada linha. Monitor DataJud e vinculo ficam em `domain-integrations`, que chama este servico.
 */
@Injectable()
export class ProcessImportCardsService {
  constructor(
    private readonly repository: ProcessImportRepository,
    private readonly access: BoardAccessService,
    private readonly viewers: KanbanViewerResolver,
    private readonly offices: OfficesRepository,
    private readonly boards: BoardsRepository,
    private readonly customers: CustomersService,
    private readonly flowCustomers: FlowCustomersRepository,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly cards: CardsService,
    private readonly activities: ActivitiesRepository,
    private readonly visibility: CardVisibilityService,
    private readonly audit: KanbanAuditService
  ) {}

  /** Boards em que o usuario cria card e escritorios que pode escolher (admin: todos os ativos). */
  async options(context: KanbanRequestContext) {
    const viewer = await this.viewers.resolve(context);
    const [boards, offices] = await Promise.all([
      this.boards.listImportDestinations(context.databaseRef, context.clientId, context.identityId, context.scopes.includes('flow:admin')),
      this.offices.listByIds(context.databaseRef, context.clientId, viewer.isAdmin ? null : viewer.officeIds)
    ]);
    return {
      boards: boards.map(({ id, name }) => ({ id, name })),
      offices: offices.filter((office) => office.active).map((office) => ({ id: office.id, name: office.name }))
    };
  }

  /** Quem importa cria card no board destino e no escritorio escolhido (premissa do PE aprovada em 2026-11-06). */
  async authorize(context: KanbanRequestContext, boardId: string, officeId: string): Promise<void> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const viewer = await this.viewers.resolve(context);
    const office = await this.offices.findById(context.databaseRef, context.clientId, officeId);
    if (!office?.active || (!viewer.isAdmin && !viewer.officeIds.includes(officeId))) {
      throw new ForbiddenException({ code: 'process_import_office_not_allowed', message: 'Escritorio nao permitido para esta importacao.' });
    }
  }

  async owners(context: KanbanRequestContext, numbers: string[]): Promise<Map<string, ProcessOwner>> {
    return this.repository.findProcessOwners(context.databaseRef, context.clientId, numbers);
  }

  async matchCustomers(context: KanbanRequestContext, rows: ValidatedRow[]): Promise<Map<number, CustomerMatch>> {
    const viewer = await this.viewers.resolve(context);
    const matches = new Map<number, CustomerMatch>();
    const byCpf = new Map<string, Promise<CustomerMatch>>();
    const lookup = async (cpf: string, name: string): Promise<CustomerMatch> => {
      const [customerId] = await this.customers.findIdsByCpf(context.clientId, cpf);
      if (!customerId) return { kind: 'new' };
      const links = await this.flowCustomers.listActiveOffices(context.databaseRef, context.clientId, customerId);
      if (!viewer.isAdmin && !links.some((link) => viewer.officeIds.includes(link.officeId))) return { kind: 'unknown' };
      const customer = await this.customers.findForFlowById(context.clientId, customerId);
      return { kind: 'existing', nameDiffers: Boolean(customer && customer.name.trim().toUpperCase() !== name.toUpperCase()) };
    };
    for (const row of rows) {
      if (!row.cpf || !row.name) continue;
      if (!byCpf.has(row.cpf)) byCpf.set(row.cpf, lookup(row.cpf, row.name));
      matches.set(row.line, await byCpf.get(row.cpf)!);
    }
    return matches;
  }

  async createLot(context: KanbanRequestContext, mutate: MutateContext, boardId: string, officeId: string, rows: NewImportRow[]): Promise<string> {
    const importId = await this.repository.createLot(context.databaseRef, context.clientId, { boardId, officeId, identityId: context.identityId, rows });
    await this.audit.record('kanban_process_import_created', mutate, boardId, { importId, officeId, rows: rows.length });
    return importId;
  }

  /**
   * Uma linha, idempotente: retomar depois de falha nao duplica cliente, card, comentario nem
   * responsaveis (o card e achado pela origem `kanban/flow_process_import/<cnj>` no board).
   */
  async processRow(context: KanbanRequestContext, mutate: MutateContext, lot: ImportLotRow, row: ImportRowRecord): Promise<RowOutcome> {
    const owner = (await this.repository.findProcessOwners(context.databaseRef, context.clientId, [row.processNumber])).get(row.processNumber);
    const ownImportCard = owner?.kind === 'import_card' && owner.boardId === lot.boardId && (!row.cardId || owner.cardId === row.cardId);
    if (owner && !ownImportCard) {
      await this.repository.markRow(context.databaseRef, context.clientId, row.id, {
        status: 'existing', existingCardId: owner.cardId, existingBoardId: owner.boardId
      });
      return { status: 'existing', owner };
    }

    let customerId = row.customerId;
    let customerCreatedNow = false;
    if (!customerId) {
      if (!row.customerCpf || !row.customerName) throw new NotFoundException({ code: 'process_import_row_purged', message: 'Linha sem dados do cliente.' });
      const result = await this.customers.createIfCpfAbsent(context.clientId, row.customerCpf, { name: row.customerName }, mutate);
      customerId = result.created ? result.id : result.existingIds[0];
      customerCreatedNow = result.created;
    }

    const masked = formatCnj(row.processNumber);
    let created: Awaited<ReturnType<CardsService['createInDefaultColumnFromSource']>>;
    try {
      created = await this.cards.createInDefaultColumnFromSource(
        context,
        lot.boardId,
        {
          sourceModule: IMPORT_SOURCE.module,
          sourceType: IMPORT_SOURCE.type,
          sourceId: row.processNumber,
          // Titulo = cliente; o numero do processo aparece abaixo, na face do card.
          title: (row.customerName?.trim() || `Processo ${masked}`).slice(0, 200),
          description: [`Numero do processo (CNJ): ${masked}`, `Tribunal: ${row.tribunal}`, `Importado de planilha (linha ${row.line}).`].join('\n'),
          sourcePayload: { processNumber: row.processNumber, tribunal: row.tribunal, importId: lot.id, line: row.line },
          officeId: lot.officeId
        },
        mutate
      );
      await this.cardCustomers.replace(context.databaseRef, context.clientId, created.card.id, customerId, context.identityId);
    } catch (error) {
      // Cliente criado agora e sem card: desfaz para nao ficar orfao (mesma compensacao da ficha do Flow).
      if (customerCreatedNow) await this.customers.discardJustCreated(context.clientId, customerId, mutate).catch(() => false);
      throw error;
    }
    const cardId = created.card.id;
    await this.repository.markRow(context.databaseRef, context.clientId, row.id, { cardId, customerId });

    let skippedAssignees = row.skippedAssignees;
    if (!row.extrasDone) {
      if (row.situation) {
        await this.activities.createComment(context.databaseRef, context.clientId, cardId, context.identityId,
          `Situacao na planilha: ${row.situation}`, { origin: 'process_import', importId: lot.id });
      }
      // Responsaveis do escritorio da importacao que enxergam o card (regra do card de entrada da validacao).
      const responsibles = (await this.offices.listResponsibles(context.databaseRef, context.clientId)).get(lot.officeId) ?? [];
      const seeing = await this.visibility.identitiesWhoSeeCard(context.databaseRef, context.clientId, lot.boardId, cardId, responsibles);
      await this.repository.addAssignees(context.databaseRef, context.clientId, cardId, seeing, context.identityId);
      skippedAssignees = responsibles.length - seeing.length;
      await this.repository.markRow(context.databaseRef, context.clientId, row.id, { extrasDone: true, skippedAssignees });
    }
    return { status: 'created', cardId, customerId, skippedAssignees };
  }
}
