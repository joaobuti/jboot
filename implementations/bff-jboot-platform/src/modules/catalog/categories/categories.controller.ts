import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../../pdv/admin/dto/common.dto';
import { PdvAuthGuard, PdvRequest } from '../../pdv/admin/guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../../pdv/admin/guards/scope.guard';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CatalogCategoriesService } from './categories.service';

@ApiTags('catalog-categories')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('catalog/categories')
export class CatalogCategoriesController {
  constructor(private readonly service: CatalogCategoriesService) {}

  @Get()
  @RequireScopes('pdv:admin:read')
  list(@Query() query: PageQueryDto, @Req() request: PdvRequest) {
    return this.service.list(request.pdvContext.clientId, query);
  }

  @Post()
  @RequireScopes('pdv:admin:write')
  create(@Body() dto: CreateCategoryDto, @Req() request: PdvRequest) {
    return this.service.create(request.pdvContext.clientId, dto);
  }

  @Patch(':id')
  @RequireScopes('pdv:admin:write')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @Req() request: PdvRequest) {
    return this.service.update(request.pdvContext.clientId, id, dto);
  }

  @Delete(':id')
  @RequireScopes('pdv:admin:write')
  inactivate(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.update(request.pdvContext.clientId, id, { status: 'inactive' });
  }
}
