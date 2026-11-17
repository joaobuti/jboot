import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { OfficeKitEmailService } from './office-kit-email.service';

export class PutOfficeKitEmailDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ maxLength: 4000, description: '[[NOME]] vira o nome do cliente; [[ESCRITORIO]], o nome do escritorio.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

/** E-mail do kit ao cliente por escritorio (docs/product/flow-signed-kit-sprints.md, S4). */
@ApiTags('kanban-office-kit-email')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/offices/:officeId/kit-email')
export class OfficeKitEmailController {
  constructor(private readonly service: OfficeKitEmailService) {}

  @Get()
  @RequireScopes('flow:admin')
  get(@Param('officeId', ParseUUIDPipe) officeId: string, @Req() request: KanbanRequest) {
    return this.service.getSettings(request.kanbanContext, officeId);
  }

  @Put()
  @RequireScopes('flow:admin')
  put(@Param('officeId', ParseUUIDPipe) officeId: string, @Body() dto: PutOfficeKitEmailDto, @Req() request: KanbanRequest) {
    return this.service.putSettings(request.kanbanContext, officeId, dto, buildMutateContext(request));
  }
}
