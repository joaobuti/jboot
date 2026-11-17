import { ForbiddenException, Injectable } from '@nestjs/common';
import { BoardsRepository } from '../kanban/boards/boards.repository';
import { OfficesRepository } from '../kanban/offices/offices.repository';
import { KanbanViewerResolver } from '../kanban/shared/kanban-viewer-resolver.service';
import { DomainApplicationContextService } from './application-context.service';
import { DomainIntegrationRequestContext } from './domain-integration.types';
import { FlowBoardsResponseDto } from './dto/domain-integration.dto';

@Injectable()
export class FlowBoardsQuery {
  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly boards: BoardsRepository,
    private readonly viewers: KanbanViewerResolver,
    private readonly offices: OfficesRepository
  ) {}

  async execute(caller: DomainIntegrationRequestContext): Promise<FlowBoardsResponseDto> {
    await this.contexts.requireCaller(caller, 'juridico', ['juridico:read']);
    const flow = await this.contexts
      .requireApplication(caller, 'flow', ['flow:read', 'flow:write'])
      .catch((error: unknown) => {
        if (error instanceof ForbiddenException) return null;
        throw error;
      });
    if (!flow) return { flowEnabled: false, boards: [], offices: [] };
    const [boards, viewer] = await Promise.all([
      this.boards.listImportDestinations(flow.databaseRef, flow.clientId, flow.identityId, flow.scopes.includes('flow:admin')),
      this.viewers.resolve(flow)
    ]);
    // Escritorios em que o usuario pode criar card: todos os ativos para flow:admin, os proprios para os demais.
    const offices = await this.offices.listByIds(flow.databaseRef, flow.clientId, viewer.isAdmin ? null : viewer.officeIds);
    return {
      flowEnabled: true,
      boards,
      offices: offices.filter((office) => office.active).map((office) => ({ id: office.id, name: office.name }))
    };
  }
}
