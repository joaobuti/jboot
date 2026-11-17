import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicMenuService } from './public-menu.service';

/**
 * Rota publica genuina — cliente final anonimo escaneia o QR da mesa, sem
 * login, sem JWT. NUNCA declarar @UseGuards(PdvAuthGuard, ...) aqui; ver
 * checklist de review em modules/catalog/MODULE_CONTRACT.md e
 * modules/catalog/skills/catalog-menu-visibility.md.
 */
@ApiTags('catalog-public')
@Controller('catalog/public')
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get('menu/:clientId')
  getMenu(@Param('clientId') clientId: string) {
    return this.service.getMenu(clientId);
  }
}
