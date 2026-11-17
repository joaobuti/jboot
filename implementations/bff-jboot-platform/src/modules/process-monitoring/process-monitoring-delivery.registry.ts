import { Injectable, Logger } from '@nestjs/common';
import { ProcessMonitorDeliveryAdapter, ProcessMonitoringProduct, ProcessMovementNotification, ProcessPublicationNotification } from './process-monitoring.types';

/**
 * Entrega das movimentacoes novas ao destino atual (ADR 021). O modulo nao importa os produtos: cada
 * produto registra o seu adaptador no bootstrap, como em `ProcessChangeNotifierRegistry`.
 */
@Injectable()
export class ProcessMonitoringDeliveryRegistry {
  private readonly logger = new Logger(ProcessMonitoringDeliveryRegistry.name);
  private readonly adapters = new Map<ProcessMonitoringProduct, ProcessMonitorDeliveryAdapter>();

  register(product: ProcessMonitoringProduct, adapter: ProcessMonitorDeliveryAdapter): void {
    this.adapters.set(product, adapter);
  }

  /** Falha de entrega nao desfaz a execucao: as movimentacoes ja estao gravadas e listaveis. */
  async deliver(product: ProcessMonitoringProduct, notification: ProcessMovementNotification): Promise<boolean> {
    const adapter = this.adapters.get(product);
    if (!adapter) {
      this.logger.warn(`process_monitoring_delivery_skipped product=${product} monitor=${notification.monitorId} reason=no_adapter`);
      return false;
    }
    try {
      await adapter.deliver(notification);
      return true;
    } catch (error) {
      this.logger.warn(
        `process_monitoring_delivery_failed product=${product} monitor=${notification.monitorId} error=${error instanceof Error ? error.message : 'unknown'}`
      );
      return false;
    }
  }

  /** Publicacoes novas do DJEN (ADR 022); destino sem tratamento de publicacao ignora. */
  async deliverPublications(product: ProcessMonitoringProduct, notification: ProcessPublicationNotification): Promise<boolean> {
    const adapter = this.adapters.get(product);
    if (!adapter?.deliverPublications) {
      this.logger.warn(`process_publications_delivery_skipped product=${product} monitor=${notification.monitorId}`);
      return false;
    }
    try {
      await adapter.deliverPublications(notification);
      return true;
    } catch (error) {
      this.logger.warn(
        `process_publications_delivery_failed product=${product} monitor=${notification.monitorId} error=${error instanceof Error ? error.message : 'unknown'}`
      );
      return false;
    }
  }
}
