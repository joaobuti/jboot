import { Body, Controller, Get, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessAuthGuard, AuthenticatedRequest } from '../auth/access-auth.guard';
import { BrandingService } from './branding.service';
import { SaveBrandingDto } from './dto/save-branding.dto';

@ApiTags('preferences')
@Controller('auth/me')
@UseGuards(AccessAuthGuard)
export class BrandingController {
  constructor(private readonly service: BrandingService) {}

  @Get('branding')
  async get(@Req() request: AuthenticatedRequest) {
    if (!request.clientId) {
      throw new UnauthorizedException('Missing client context');
    }
    const branding = await this.service.get(request.clientId);
    return { branding };
  }

  @Put('branding')
  async save(@Body() dto: SaveBrandingDto, @Req() request: AuthenticatedRequest) {
    if (!request.clientId) {
      throw new UnauthorizedException('Missing client context');
    }
    const branding = await this.service.save(request.clientId, dto);
    return { branding };
  }
}
