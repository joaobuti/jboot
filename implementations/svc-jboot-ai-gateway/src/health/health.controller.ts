import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get('health') health() { return { status: 'ok', service: 'svc-jboot-ai-gateway' }; }
  @Get('ready') async ready() { try { await this.db.query('SELECT 1'); return { status: 'ready' }; } catch { throw new ServiceUnavailableException('database unavailable'); } }
}
