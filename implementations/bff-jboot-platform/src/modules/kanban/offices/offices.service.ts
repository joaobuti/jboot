import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { FlowAdminDirectory } from '../shared/flow-admin-directory.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { OFFICE_NOT_ALLOWED } from './card-office.policy';
import {
  AssignBoardCardsOfficeDto,
  CreateOfficeDto,
  OfficeContextResponse,
  FlowUserManagementContextResponse,
  OfficeSettingsResponse,
  OfficeUserResponse,
  ReplaceUserOfficesDto,
  ReplaceUserOfficesResponse,
  TransferCardOfficeDto,
  TransferCardOfficeResponse,
  UpdateOfficeDto,
  UpdateOfficeSettingsDto
} from './dto/office.dto';
import { OfficeListRow, OfficeRow, OfficesRepository } from './offices.repository';
import { ActiveOfficeService } from './active-office.service';
import { FlowIdentityClient } from '../user-provisioning/flow-identity.client';

/** Permissoes de IA do responsavel de escritorio (flow-offices-sprints.md, S4). */
export const OFFICE_RESPONSIBLE_AI_SCOPES = ['ai:agents:read', 'ai:agents:manage'];

export const OFFICE_ADMIN_REQUIRED = {
  code: 'office_admin_required',
  message: 'Only a Flow tenant admin (flow:admin) can manage offices'
} as const;

export const NO_ACTIVE_OFFICE = {
  code: 'no_active_office',
  message: 'Register at least one active office before enabling office visibility'
} as const;

/**
 * Escritorios e visibilidade por escritorio (CRM de leads, Sprint 3.5; ADR 014,
 * Decisao 6). Tudo aqui e do administrador (`flow:admin`), exceto o contexto
 * (`context`), que todo usuario do Flow le para montar a tela.
 * Auditoria e `system_event` so com ids, nomes de escritorio e o motivo da
 * transferencia (texto livre do admin); nunca dado pessoal.
 */
@Injectable()
export class OfficesService {
  constructor(
    private readonly offices: OfficesRepository,
    private readonly access: BoardAccessService,
    private readonly visibility: CardVisibilityService,
    private readonly directory: FlowAdminDirectory,
    private readonly audit: KanbanAuditService,
    private readonly activeOffice: ActiveOfficeService,
    private readonly identity: FlowIdentityClient
  ) {}

  async context(context: KanbanRequestContext): Promise<OfficeContextResponse> {
    const viewer = await this.visibility.resolveViewer(context);
    const offices = viewer.isAdmin
      ? await this.offices.listByIds(context.databaseRef, context.clientId, null)
      : viewer.officeIds.length > 0
        ? await this.offices.listByIds(context.databaseRef, context.clientId, viewer.officeIds)
        : [];
    return {
      officeVisibilityEnabled: viewer.officeVisibilityEnabled,
      isAdmin: viewer.isAdmin,
      userOfficeIds: viewer.officeIds,
      offices: offices.map(toOfficeResponse)
    };
  }

  async userManagementContext(context: KanbanRequestContext): Promise<FlowUserManagementContextResponse> {
    const isTenantManager = context.scopes.includes('users:manage');
    const multipleOffices = context.scopes.includes('flow:admin');
    if (!isTenantManager) {
      // Gestor delegado: o usuario novo entra no escritorio ativo de quem cadastra (S2).
      const state = await this.activeOffice.state(context);
      const active = state.offices.find((office) => office.id === state.activeOfficeId);
      if (!active) {
        throw new ForbiddenException({
          code: 'actor_without_active_office',
          message: 'Delegated user manager has no active office'
        });
      }
      return { officeAssignmentMode: 'inherited', offices: [{ id: active.id, name: active.name }], multipleOffices: false };
    }
    const offices = (await this.offices.listByIds(context.databaseRef, context.clientId, null))
      .filter(office => office.active)
      .map(({ id, name }) => ({ id, name }));
    return { officeAssignmentMode: 'selectable', offices, multipleOffices };
  }

  async list(context: KanbanRequestContext): Promise<{ data: OfficeListRow[] }> {
    requireAdmin(context);
    return { data: await this.offices.list(context.databaseRef, context.clientId) };
  }

  async create(context: KanbanRequestContext, dto: CreateOfficeDto, mutate: MutateContext): Promise<OfficeRow> {
    requireAdmin(context);
    const office = await this.offices.create(context.databaseRef, context.clientId, dto.name, context.identityId, officePlace(dto) ?? null);
    await this.audit.record('kanban_office_created', mutate, null, { officeId: office.id, name: office.name });
    return office;
  }

  async update(context: KanbanRequestContext, officeId: string, dto: UpdateOfficeDto, mutate: MutateContext): Promise<OfficeRow> {
    requireAdmin(context);
    let office = await this.offices.update(context.databaseRef, context.clientId, officeId, {
      name: dto.name,
      active: dto.active,
      place: officePlace(dto)
    });
    if (dto.isPrincipal) office = await this.offices.setPrincipal(context.databaseRef, context.clientId, officeId);
    await this.audit.record('kanban_office_updated', mutate, null, {
      officeId,
      name: dto.name,
      active: dto.active,
      uf: dto.uf,
      ...(dto.isPrincipal ? { isPrincipal: true } : {})
    });
    return office;
  }

  async listUsers(context: KanbanRequestContext): Promise<{ data: OfficeUserResponse[] }> {
    requireAdmin(context);
    const [users, links, responsible] = await Promise.all([
      this.directory.listFlowUsers(context.clientId),
      this.offices.listOfficeIdsByIdentity(context.databaseRef, context.clientId, null),
      this.offices.listResponsibleOfficeIdsByIdentity(context.databaseRef, context.clientId)
    ]);
    return {
      data: users.map((user) => ({
        ...user,
        officeIds: links.get(user.identityId) ?? [],
        responsibleOfficeIds: responsible.get(user.identityId) ?? []
      }))
    };
  }

  /**
   * Substitui os escritorios do usuario. So usuario com acesso ao Flow no
   * tenant; vinculo NOVO so com escritorio ativo (vinculo existente a
   * escritorio inativo pode ser mantido). Ao sair de um escritorio, o usuario
   * deixa de ser responsavel pelos cards dele e o admin recebe a lista (P28).
   * A visibilidade muda na requisicao seguinte do usuario (sem novo login).
   */
  async replaceUserOffices(
    context: KanbanRequestContext,
    identityId: string,
    dto: ReplaceUserOfficesDto,
    mutate: MutateContext,
    authorization?: string
  ): Promise<ReplaceUserOfficesResponse> {
    requireAdmin(context);
    const users = await this.directory.listFlowUsers(context.clientId);
    if (!users.some((user) => user.identityId === identityId)) {
      throw new NotFoundException({ code: 'flow_user_not_found', message: 'User has no access to Flow in this tenant' });
    }
    const current = (await this.offices.listOfficeIdsByIdentity(context.databaseRef, context.clientId, [identityId])).get(identityId) ?? [];
    const requested = dto.officeIds.length > 0 ? await this.offices.listByIds(context.databaseRef, context.clientId, dto.officeIds) : [];
    const byId = new Map(requested.map((office) => [office.id, office]));
    for (const officeId of dto.officeIds) {
      const office = byId.get(officeId);
      if (!office || (!office.active && !current.includes(officeId))) {
        throw new UnprocessableEntityException(OFFICE_NOT_ALLOWED);
      }
    }
    if (dto.responsibleOfficeIds?.some((officeId) => !dto.officeIds.includes(officeId))) {
      throw new UnprocessableEntityException({
        code: 'responsible_office_not_linked',
        message: 'User can only be responsible for an office they are linked to'
      });
    }
    const result = await this.offices.replaceUserOffices(
      context.databaseRef,
      context.clientId,
      identityId,
      dto.officeIds,
      context.identityId,
      dto.responsibleOfficeIds
    );
    if (result.added.length > 0 || result.removed.length > 0 || dto.responsibleOfficeIds) {
      await this.audit.record('kanban_user_offices_changed', mutate, null, {
        identityId,
        added: result.added,
        removed: result.removed,
        ...(dto.responsibleOfficeIds ? { responsibleOfficeIds: dto.responsibleOfficeIds } : {}),
        removedAssignmentCardIds: result.removedAssignments.map((row) => row.cardId)
      });
    }
    // Responsavel de escritorio recebe as permissoes de IA (ver/alterar agente do escritorio, S4).
    // Falha no Identity nao desfaz a troca de escritorios: a resposta avisa para conceder pela tela de usuarios.
    let aiPermissionsGranted: boolean | null = null;
    if (dto.responsibleOfficeIds?.length && authorization) {
      try {
        await this.identity.grantModuleScopes(authorization, identityId, OFFICE_RESPONSIBLE_AI_SCOPES);
        aiPermissionsGranted = true;
      } catch {
        aiPermissionsGranted = false;
      }
    }
    return {
      identityId,
      officeIds: [...dto.officeIds].sort(),
      added: result.added,
      removed: result.removed,
      removedAssignments: result.removedAssignments,
      aiPermissionsGranted
    };
  }

  async getSettings(context: KanbanRequestContext): Promise<OfficeSettingsResponse> {
    requireAdmin(context);
    const [settings, activeOfficeCount, byBoard, users, links] = await Promise.all([
      this.offices.getSettings(context.databaseRef, context.clientId),
      this.offices.countActive(context.databaseRef, context.clientId),
      this.offices.countCardsWithoutOfficeByBoard(context.databaseRef, context.clientId),
      this.directory.listFlowUsers(context.clientId),
      this.offices.listOfficeIdsByIdentity(context.databaseRef, context.clientId, null)
    ]);
    return {
      officeVisibilityEnabled: settings.officeVisibilityEnabled,
      enabledAt: settings.enabledAt,
      enabledByIdentityId: settings.enabledByIdentityId,
      activeOfficeCount,
      cardsWithoutOffice: { total: byBoard.reduce((sum, row) => sum + row.count, 0), byBoard },
      usersWithoutOffice: users
        .filter((user) => !user.isAdmin && (links.get(user.identityId)?.length ?? 0) === 0)
        .map((user) => ({ identityId: user.identityId, displayName: user.displayName }))
    };
  }

  /**
   * Liga/desliga a visibilidade por escritorio do tenant (P26). Ligar exige ao
   * menos um escritorio ativo; a confirmacao com a pre-visualizacao e da tela.
   * Desligar e rollback sem perda de dado.
   */
  async updateSettings(context: KanbanRequestContext, dto: UpdateOfficeSettingsDto, mutate: MutateContext): Promise<OfficeSettingsResponse> {
    requireAdmin(context);
    if (dto.officeVisibilityEnabled && (await this.offices.countActive(context.databaseRef, context.clientId)) === 0) {
      throw new UnprocessableEntityException(NO_ACTIVE_OFFICE);
    }
    const before = await this.getSettings(context);
    await this.offices.setOfficeVisibility(context.databaseRef, context.clientId, dto.officeVisibilityEnabled, context.identityId);
    if (before.officeVisibilityEnabled !== dto.officeVisibilityEnabled) {
      await this.audit.record(
        dto.officeVisibilityEnabled ? 'kanban_office_visibility_enabled' : 'kanban_office_visibility_disabled',
        mutate,
        null,
        { cardsWithoutOffice: before.cardsWithoutOffice.total, usersWithoutOffice: before.usersWithoutOffice.length }
      );
    }
    return this.getSettings(context);
  }

  /** Atribuicao em lote por quadro (cards sem escritorio), um `system_event` por card e uma auditoria. */
  async assignBoardCards(
    context: KanbanRequestContext,
    boardId: string,
    dto: AssignBoardCardsOfficeDto,
    mutate: MutateContext
  ): Promise<{ updated: number; cardIds: string[] }> {
    requireAdmin(context);
    await this.access.requireBoard(context, boardId);
    await this.requireActiveOffice(context, dto.officeId);
    const cardIds = await this.offices.assignCardsWithoutOffice(
      context.databaseRef,
      context.clientId,
      boardId,
      dto.officeId,
      dto.cardIds ?? null,
      context.identityId
    );
    if (cardIds.length > 0) {
      await this.audit.record('kanban_cards_office_assigned', mutate, boardId, { officeId: dto.officeId, count: cardIds.length });
    }
    return { updated: cardIds.length, cardIds };
  }

  /**
   * Transferencia de card entre escritorios (P23): so admin, motivo
   * obrigatorio, card visivel ao admin, escritorio destino ativo. Cliente,
   * checklist, documentos e historico acompanham o card (sao do card).
   */
  async transferCard(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: TransferCardOfficeDto,
    mutate: MutateContext
  ): Promise<TransferCardOfficeResponse> {
    requireAdmin(context);
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.requireActiveOffice(context, dto.officeId);
    const result = await this.offices.transferCard(
      context.databaseRef,
      context.clientId,
      boardId,
      cardId,
      dto.officeId,
      dto.reason,
      context.identityId
    );
    if (!result) {
      throw new NotFoundException('Card not found');
    }
    if (result.changed) {
      await this.audit.record('kanban_card_office_changed', mutate, boardId, {
        cardId,
        fromOfficeId: result.fromOfficeId,
        toOfficeId: dto.officeId,
        reason: dto.reason
      });
    }
    return { cardId, fromOfficeId: result.fromOfficeId, officeId: dto.officeId, changed: result.changed };
  }

  private async requireActiveOffice(context: KanbanRequestContext, officeId: string): Promise<OfficeRow> {
    const office = await this.offices.findById(context.databaseRef, context.clientId, officeId);
    if (!office?.active) {
      throw new UnprocessableEntityException(OFFICE_NOT_ALLOWED);
    }
    return office;
  }
}

/** Defesa em profundidade: o controller ja exige o scope, o servico confere de novo. */
function requireAdmin(context: KanbanRequestContext): void {
  if (!context.scopes.includes(FLOW_ADMIN_SCOPE)) {
    throw new ForbiddenException(OFFICE_ADMIN_REQUIRED);
  }
}

function toOfficeResponse(office: OfficeRow) {
  return { id: office.id, name: office.name, active: office.active };
}

/**
 * Cidade e UF do escritorio (local do fecho da peticao, S7): os dois juntos ou nenhum. `undefined` =
 * campos ausentes (mantem o atual); `null` = limpar.
 */
export function officePlace(dto: { city?: string | null; uf?: string | null }): { city: string; uf: string } | null | undefined {
  if (dto.city === undefined && dto.uf === undefined) return undefined;
  const city = dto.city?.replace(/\s+/g, ' ').trim() || null;
  const uf = dto.uf ?? null;
  if (!city && !uf) return null;
  if (!city || !uf) {
    throw new UnprocessableEntityException({ code: 'office_place_incomplete', message: 'Informe cidade e UF do escritorio, ou deixe os dois em branco.' });
  }
  return { city, uf };
}
