import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { DocumentTypesService } from './document-types.service';
import {
  ApplyInitialDocumentTypesResponse,
  BoardDocumentTypeResponse,
  CreateBoardDocumentTypeDto,
  UpdateBoardDocumentTypeDto
} from './dto/document-type.dto';

// Sem DELETE: tipo de documento e desativado (`PATCH { active: false }`), nunca apagado,
// para preservar o historico de documentos ja enviados.
@ApiTags('kanban-document-types')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/document-types')
export class DocumentTypesController {
  constructor(private readonly documentTypes: DocumentTypesService) {}

  @Get()
  @RequireScopes('flow:admin')
  list(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Req() request: KanbanRequest
  ): Promise<{ data: BoardDocumentTypeResponse[] }> {
    return this.documentTypes.list(request.kanbanContext, boardId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateBoardDocumentTypeDto,
    @Req() request: KanbanRequest
  ): Promise<BoardDocumentTypeResponse> {
    return this.documentTypes.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Post('apply-initial-list')
  @RequireScopes('flow:admin')
  applyInitialList(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Req() request: KanbanRequest
  ): Promise<ApplyInitialDocumentTypesResponse> {
    return this.documentTypes.applyInitialList(request.kanbanContext, boardId, buildMutateContext(request));
  }

  @Patch(':documentTypeId')
  @RequireScopes('flow:admin')
  update(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('documentTypeId', ParseUUIDPipe) documentTypeId: string,
    @Body() dto: UpdateBoardDocumentTypeDto,
    @Req() request: KanbanRequest
  ): Promise<BoardDocumentTypeResponse> {
    return this.documentTypes.update(request.kanbanContext, boardId, documentTypeId, dto, buildMutateContext(request));
  }
}
