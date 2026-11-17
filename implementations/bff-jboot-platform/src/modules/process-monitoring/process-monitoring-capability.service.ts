import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PROCESS_MONITORING_CAPABILITY, PROCESS_PUBLICATIONS_CAPABILITY } from './process-monitoring.types';

/**
 * Capacidade contratada pelo cliente (ADR 006/021), sem entitlement por usuario. So criar ou retomar
 * acompanhamento exige a capacidade; ler o que ja existe nao, para o cliente nao perder o historico.
 */
@Injectable()
export class ProcessMonitoringCapabilityService {
  constructor(private readonly database: DatabaseService) {}

  async isEnabled(clientId: string, capability: string = PROCESS_MONITORING_CAPABILITY): Promise<boolean> {
    const result = await this.database.queryIdentity(
      `SELECT 1
       FROM client_capabilities cc
       JOIN capability_registry r ON r.slug = cc.capability AND r.active
       WHERE cc.client_id = $1 AND cc.capability = $2 AND cc.enabled`,
      [clientId, capability]
    );
    return result.rows.length > 0;
  }

  /** Publicacoes (DJEN) dependem do monitoramento processual (ADR 022): valem so com as duas. */
  async publicationsEnabled(clientId: string): Promise<boolean> {
    const [monitoring, publications] = await Promise.all([
      this.isEnabled(clientId),
      this.isEnabled(clientId, PROCESS_PUBLICATIONS_CAPABILITY)
    ]);
    return monitoring && publications;
  }

  async requirePublications(clientId: string): Promise<void> {
    if (!(await this.publicationsEnabled(clientId))) {
      throw new ForbiddenException({
        code: 'process_publications_not_contracted',
        message: 'Publicacoes processuais (DJEN) nao contratadas para este cliente.'
      });
    }
  }

  async require(clientId: string): Promise<void> {
    if (!(await this.isEnabled(clientId))) {
      throw new ForbiddenException({
        code: 'process_monitoring_not_contracted',
        message: 'Monitoramento processual nao contratado para este cliente.'
      });
    }
  }
}
