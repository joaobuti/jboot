import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { PdvAuthGuard, PdvRequest } from '../guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CreateOperatorDto, UpdateOperatorDto } from './dto/operator.dto';
import { OperatorsService } from './operators.service';

@ApiTags('pdv-admin-operators')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/admin/operators')
export class OperatorsController {
  constructor(private readonly operators: OperatorsService) {}

  @Get()
  @RequireScopes('pdv:operators:manage')
  list(@Query() query: PageQueryDto, @Req() request: PdvRequest) {
    return this.operators.list(request.pdvContext.clientId, query);
  }

  @Post()
  @RequireScopes('pdv:operators:manage')
  create(@Body() dto: CreateOperatorDto, @Req() request: PdvRequest) {
    return this.operators.create(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Patch(':operatorId')
  @RequireScopes('pdv:operators:manage')
  update(@Param('operatorId') operatorId: string, @Body() dto: UpdateOperatorDto, @Req() request: PdvRequest) {
    return this.operators.update(request.pdvContext.clientId, operatorId, dto, buildMutateContext(request));
  }

  @Delete(':operatorId')
  @RequireScopes('pdv:operators:manage')
  delete(@Param('operatorId') operatorId: string, @Req() request: PdvRequest) {
    return this.operators.update(request.pdvContext.clientId, operatorId, { status: 'inactive' }, buildMutateContext(request));
  }
}
