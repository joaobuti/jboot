import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../pdv/admin/dto/common.dto';
import { PdvAuthGuard, PdvRequest } from '../pdv/admin/guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../pdv/admin/guards/scope.guard';
import { buildMutateContext } from '../pdv/admin/shared/request-context';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('pdv-admin-customers')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('pdv/admin/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequireScopes('pdv:admin:read')
  list(@Query() query: PageQueryDto, @Req() request: PdvRequest) {
    return this.customers.list(request.pdvContext.clientId, query);
  }

  @Post()
  @RequireScopes('pdv:admin:write')
  create(@Body() dto: CreateCustomerDto, @Req() request: PdvRequest) {
    return this.customers.create(request.pdvContext.clientId, dto, buildMutateContext(request));
  }

  @Patch(':customerId')
  @RequireScopes('pdv:admin:write')
  update(@Param('customerId') customerId: string, @Body() dto: UpdateCustomerDto, @Req() request: PdvRequest) {
    return this.customers.update(request.pdvContext.clientId, customerId, dto, buildMutateContext(request));
  }

  @Delete(':customerId')
  @RequireScopes('pdv:admin:write')
  delete(@Param('customerId') customerId: string, @Req() request: PdvRequest) {
    return this.customers.update(request.pdvContext.clientId, customerId, { status: 'inactive' }, buildMutateContext(request));
  }
}
