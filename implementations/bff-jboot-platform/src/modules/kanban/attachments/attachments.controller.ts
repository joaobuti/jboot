import { Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { AttachmentsService, MAX_ATTACHMENT_SIZE_BYTES } from './attachments.service';

@ApiTags('kanban-card-attachments')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/activities/:activityId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  list(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Param('activityId') activityId: string,
    @Req() request: KanbanRequest
  ) {
    return this.attachments.list(request.kanbanContext, boardId, cardId, activityId);
  }

  @Post()
  @RequireScopes('flow:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES }
    })
  )
  upload(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Param('activityId') activityId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ) {
    return this.attachments.upload(request.kanbanContext, boardId, cardId, activityId, file);
  }

  @Get(':attachmentId/download')
  getDownloadUrl(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Param('activityId') activityId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: KanbanRequest
  ) {
    return this.attachments.getDownloadUrl(request.kanbanContext, boardId, cardId, activityId, attachmentId);
  }
}
