import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachments.service';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CustomerDocumentsService } from './customer-documents.service';
import { UpdateCustomerDocumentProfileDto } from './dto/customer-documents.dto';

/** Documentos da ficha do cliente (ADR 017, S1). Visibilidade igual a da ficha. */
@ApiTags('kanban-flow-customer-documents')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/customers/:customerId/documents')
export class CustomerDocumentsController {
  constructor(private readonly service: CustomerDocumentsService) {}

  @Get()
  @RequireScopes('flow:customers:read', 'flow:admin')
  list(@Param('customerId', ParseUUIDPipe) customerId: string, @Req() request: KanbanRequest) {
    return this.service.list(request.kanbanContext, customerId, buildMutateContext(request));
  }

  @Patch('profile')
  @RequireScopes('flow:customers:write', 'flow:admin')
  updateProfile(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCustomerDocumentProfileDto,
    @Req() request: KanbanRequest
  ) {
    return this.service.updateProfile(
      request.kanbanContext,
      customerId,
      { residenceProofThirdParty: dto.residenceProofThirdParty, cpfOnIdentity: dto.cpfOnIdentity },
      buildMutateContext(request)
    );
  }

  @Post(':documentType')
  @RequireScopes('flow:customers:write', 'flow:admin')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  upload(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('documentType') documentType: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ) {
    return this.service.upload(request.kanbanContext, customerId, documentType, file, buildMutateContext(request));
  }

  @Delete(':documentType')
  @RequireScopes('flow:customers:write', 'flow:admin')
  remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('documentType') documentType: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.remove(request.kanbanContext, customerId, documentType, buildMutateContext(request));
  }

  @Get('versions/:documentId/download')
  @RequireScopes('flow:customers:read', 'flow:admin')
  download(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ) {
    return this.service.download(request.kanbanContext, customerId, documentId, buildMutateContext(request));
  }
}
