import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { memoryStorage } from 'multer';
import { PageQueryDto } from '../../pdv/admin/dto/common.dto';
import { PdvAuthGuard, PdvRequest } from '../../pdv/admin/guards/pdv-auth.guard';
import { RequireScopes, ScopeGuard } from '../../pdv/admin/guards/scope.guard';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CatalogProductsService } from './products.service';

class ProductListQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  visibleInPdv?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  visibleInCardapio?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  visibleInComanda?: boolean;
}

@ApiTags('catalog-products')
@ApiBearerAuth()
@UseGuards(PdvAuthGuard, ScopeGuard)
@Controller('catalog/products')
export class CatalogProductsController {
  constructor(private readonly service: CatalogProductsService) {}

  @Get()
  @RequireScopes('pdv:admin:read')
  list(@Query() query: ProductListQueryDto, @Req() request: PdvRequest) {
    return this.service.list(request.pdvContext.clientId, query);
  }

  @Post()
  @RequireScopes('pdv:admin:write')
  create(@Body() dto: CreateProductDto, @Req() request: PdvRequest) {
    return this.service.create(request.pdvContext.clientId, dto, request.pdvContext.identityId);
  }

  @Patch(':id')
  @RequireScopes('pdv:admin:write')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @Req() request: PdvRequest) {
    return this.service.update(request.pdvContext.clientId, id, dto);
  }

  @Post(':id/image')
  @RequireScopes('pdv:admin:write')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  }))
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: PdvRequest
  ) {
    return this.service.uploadImage(request.pdvContext.clientId, id, request.pdvContext.identityId, file);
  }

  @Delete(':id')
  @RequireScopes('pdv:admin:write')
  inactivate(@Param('id') id: string, @Req() request: PdvRequest) {
    return this.service.update(request.pdvContext.clientId, id, { status: 'inactive' });
  }
}
