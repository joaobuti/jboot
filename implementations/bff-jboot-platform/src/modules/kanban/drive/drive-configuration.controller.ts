import { Body, Controller, Delete, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { FlowCustomerRateLimitGuard } from '../flow-customers/flow-customer-rate-limit.guard';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { DriveConfigurationWriteDto, DriveConnectCompleteDto, DriveConnectDto } from './dto/drive-configuration.dto';
import { DriveConfigurationService } from './drive-configuration.service';

@Controller('kanban/settings/google-drive') @UseGuards(KanbanAuthGuard,ScopeGuard) @RequireScopes('flow:admin')
export class DriveConfigurationController {
  constructor(private readonly service:DriveConfigurationService) {}
  @Get() get(@Req() req:KanbanRequest){return this.service.get(req.kanbanContext);}
  @Put() put(@Body() dto:DriveConfigurationWriteDto,@Req() req:KanbanRequest){return this.service.put(req.kanbanContext,dto,buildMutateContext(req));}
  @Delete() disconnect(@Req() req:KanbanRequest){return this.service.disconnect(req.kanbanContext,buildMutateContext(req));}
  @Post('connect') @HttpCode(200) @UseGuards(FlowCustomerRateLimitGuard)
  connect(@Body() dto:DriveConnectDto,@Req() req:KanbanRequest){return this.service.connect(req.kanbanContext,dto.redirectUri);}
  @Post('connect/complete') @HttpCode(200) @UseGuards(FlowCustomerRateLimitGuard)
  complete(@Body() dto:DriveConnectCompleteDto,@Req() req:KanbanRequest){return this.service.completeConnect(req.kanbanContext,dto,buildMutateContext(req));}
  @Post('picker-token') @HttpCode(200) @UseGuards(FlowCustomerRateLimitGuard)
  pickerToken(@Req() req:KanbanRequest){return this.service.pickerToken(req.kanbanContext);}
}
