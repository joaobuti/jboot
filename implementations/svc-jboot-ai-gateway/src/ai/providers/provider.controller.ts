import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../auth/user-auth.guard';
import { ProviderCatalog } from './provider-catalog';

@ApiTags('providers') @ApiBearerAuth() @UseGuards(UserAuthGuard) @Controller('v1/providers')
export class ProviderController { constructor(private readonly catalog: ProviderCatalog) {} @Get() list() { return this.catalog.list(); } }
