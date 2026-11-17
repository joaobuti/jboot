import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessAuthGuard, AuthenticatedRequest } from '../auth/access-auth.guard';
import { SaveLayoutPreferenceDto } from './dto/save-layout-preference.dto';
import { LayoutPreferenceService } from './layout-preference.service';

@ApiTags('preferences')
@Controller('auth/me')
@UseGuards(AccessAuthGuard)
export class LayoutPreferenceController {
  constructor(private readonly service: LayoutPreferenceService) {}

  @Get('layout-preference')
  async get(@Req() request: AuthenticatedRequest) {
    const preference = await this.service.get(request.identityId);
    return { preference };
  }

  @Put('layout-preference')
  async save(@Body() dto: SaveLayoutPreferenceDto, @Req() request: AuthenticatedRequest) {
    const preference = await this.service.save(request.identityId, dto.preference);
    return { preference };
  }
}
