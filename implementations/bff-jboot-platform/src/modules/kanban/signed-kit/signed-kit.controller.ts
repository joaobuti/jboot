import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachments.service';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { VALIDATION_APPROVE_SCOPE } from '../customer-validation/customer-validation.controller';
import { buildMutateContext } from '../shared/request-context';
import { SignedKitService } from './signed-kit.service';

/**
 * Kit assinado no bloco Documentos do card (docs/product/flow-signed-kit-sprints.md, S2). A validacao parte da
 * acao "Validar assinatura" da coluna (S5, `CardActionsController`).
 */
@ApiTags('kanban-signed-kit')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/office-kit')
export class SignedKitController {
  constructor(private readonly service: SignedKitService) {}

  @Get('signature')
  view(@Param('boardId', ParseUUIDPipe) boardId: string, @Param('cardId', ParseUUIDPipe) cardId: string, @Req() request: KanbanRequest) {
    return this.service.cardView(request.kanbanContext, boardId, cardId);
  }

  // Mesmo limite de tamanho dos anexos; tipo e PDF com senha conferidos no servico.
  @Post(':kitId/signed')
  @RequireScopes('flow:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  upload(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('kitId', ParseUUIDPipe) kitId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ) {
    return this.service.upload(request.kanbanContext, boardId, cardId, kitId, file, buildMutateContext(request));
  }

  @Get(':kitId/signed/:signedKitId/download')
  download(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('kitId', ParseUUIDPipe) kitId: string,
    @Param('signedKitId', ParseUUIDPipe) signedKitId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.download(request.kanbanContext, boardId, cardId, kitId, signedKitId, buildMutateContext(request));
  }

  /** Mesma permissao de confirmar a validacao de cadastro (ADR 018); o servico confere de novo. */
  @Post(':kitId/signature-validation/:runId/confirm')
  @RequireScopes(VALIDATION_APPROVE_SCOPE)
  confirm(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('kitId', ParseUUIDPipe) kitId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.confirm(request.kanbanContext, boardId, cardId, kitId, runId, buildMutateContext(request));
  }
}
