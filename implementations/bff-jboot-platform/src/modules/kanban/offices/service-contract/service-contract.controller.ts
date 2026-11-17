import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { TEMPLATE_LIMITS } from '../../document-templates/docx-package';
import { KanbanAuthGuard, KanbanRequest } from '../../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../../guards/scope.guard';
import { buildMutateContext } from '../../shared/request-context';
import {
  ServiceContractDownloadDto,
  ServiceContractDto,
  ServiceContractVersionDto,
  UploadServiceContractResponseDto
} from './dto/service-contract.dto';
import { ServiceContractService } from './service-contract.service';

// Contrato de servicos por escritorio (docs/product/flow-office-service-contract-sprints.md).
// Contrato HTTP: docs/api/flow-office-service-contract-openapi.yaml.
@ApiTags('kanban-office-service-contract')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/offices/:officeId/service-contract')
export class ServiceContractController {
  constructor(private readonly contracts: ServiceContractService) {}

  @Get()
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: ServiceContractDto })
  get(@Param('officeId', ParseUUIDPipe) officeId: string, @Req() request: KanbanRequest): Promise<ServiceContractDto> {
    return this.contracts.get(request.kanbanContext, officeId);
  }

  @Get('versions/:version')
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: ServiceContractVersionDto })
  version(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() request: KanbanRequest
  ): Promise<ServiceContractVersionDto> {
    return this.contracts.getVersion(request.kanbanContext, officeId, version);
  }

  // Multer limitado ao teto dos modelos `.docx` (10 MB); tipo, extensao e pacote validados no servico.
  @Post('versions')
  @RequireScopes('flow:admin')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: UploadServiceContractResponseDto })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: TEMPLATE_LIMITS.maxCompressedBytes, files: 1 } }))
  upload(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ): Promise<UploadServiceContractResponseDto> {
    return this.contracts.upload(request.kanbanContext, buildMutateContext(request), officeId, file);
  }

  @Get('versions/:version/download')
  @RequireScopes('flow:admin')
  @ApiOkResponse({ type: ServiceContractDownloadDto })
  download(
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() request: KanbanRequest
  ): Promise<ServiceContractDownloadDto> {
    return this.contracts.download(request.kanbanContext, officeId, version);
  }
}
