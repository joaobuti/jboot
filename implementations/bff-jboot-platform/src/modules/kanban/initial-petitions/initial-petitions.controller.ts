import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { TEMPLATE_LIMITS } from '../document-templates/docx-package';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { InitialPetitionsService } from './initial-petitions.service';
import { RegisterPetitionProtocolDto } from './dto/register-petition-protocol.dto';
import { PetitionProtocolService } from './petition-protocol.service';

/** Scope do advogado que aprova a peticao (ADR 020, Q7); `flow:admin` tambem aprova. */
export const PETITION_APPROVE_SCOPE = 'flow:petition:approve';

/**
 * Peticoes iniciais registradas pela rotina (S5 de docs/product/flow-initial-petitions-sprints.md).
 * Leitura e download para quem ve o card; aprovacao e versao corrigida (S8) so com `flow:petition:approve`
 * ou `flow:admin`.
 * Contrato HTTP: docs/api/flow-initial-petitions-openapi.yaml.
 */
@ApiTags('kanban-initial-petitions')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/initial-petitions')
export class InitialPetitionsController {
  constructor(
    private readonly petitions: InitialPetitionsService,
    private readonly protocols: PetitionProtocolService
  ) {}

  /** Execucao de peticoes mais recente do card; `{ run: null }` quando nunca houve. */
  @Get()
  latest(@Param('boardId', ParseUUIDPipe) boardId: string, @Param('cardId', ParseUUIDPipe) cardId: string, @Req() request: KanbanRequest) {
    return this.withProtocolPermission(request, boardId, cardId);
  }

  @Get('documents/:documentId/download')
  download(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ) {
    return this.petitions.download(request.kanbanContext, boardId, cardId, documentId);
  }

  @Post('documents/:documentId/approve')
  @HttpCode(200)
  @RequireScopes(PETITION_APPROVE_SCOPE, 'flow:admin')
  approve(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ) {
    return this.petitions.approve(request.kanbanContext, boardId, cardId, documentId, buildMutateContext(request));
  }

  // Multer limitado ao teto do .docx (10 MB); tipo, extensao e pacote conferidos no servico.
  @Post('documents/:documentId/corrected-version')
  @HttpCode(200)
  @RequireScopes(PETITION_APPROVE_SCOPE, 'flow:admin')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: TEMPLATE_LIMITS.maxCompressedBytes, files: 1 } }))
  uploadCorrected(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ) {
    return this.petitions.uploadCorrected(request.kanbanContext, boardId, cardId, documentId, file, buildMutateContext(request));
  }

  /**
   * Numero do processo (CNJ) da peticao aprovada, registrado manualmente ate existir o protocolo
   * automatico (docs/product/flow-card-actions-sprints.md, Sprint 2). Permissao no servico: `board_admin`
   * do board ou responsavel pelo card.
   */
  @Post(':petitionId/protocol')
  @HttpCode(200)
  async registerProtocol(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('petitionId', ParseUUIDPipe) petitionId: string,
    @Body() dto: RegisterPetitionProtocolDto,
    @Req() request: KanbanRequest
  ) {
    await this.protocols.register(request.kanbanContext, boardId, cardId, petitionId, dto.processNumber, buildMutateContext(request));
    return this.withProtocolPermission(request, boardId, cardId);
  }

  /** `canRegisterProtocol`: a tela so mostra "Registrar numero do processo" a quem o servico aceita. */
  private async withProtocolPermission(request: KanbanRequest, boardId: string, cardId: string) {
    const latest = await this.petitions.latestForCard(request.kanbanContext, boardId, cardId);
    return { ...latest, canRegisterProtocol: await this.protocols.canRegister(request.kanbanContext, boardId, cardId) };
  }
}
