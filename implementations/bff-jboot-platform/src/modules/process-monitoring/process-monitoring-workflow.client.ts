import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { cadenceSeconds } from './process-fingerprint';
import { ProcessMonitorCadence } from './process-monitoring.types';

/**
 * Agendamento no worker Temporal (`wrk-jboot-juridico`, rota `/process-monitors`). O workflow
 * `process-monitor:{client_id}:{monitor_id}` chama de volta a rota interna deste modulo.
 */
@Injectable()
export class ProcessMonitoringWorkflowClient {
  constructor(private readonly config: AppConfigService) {}

  start(clientId: string, monitorId: string, cadence: ProcessMonitorCadence): Promise<void> {
    return this.post('/process-monitors', { monitor_id: monitorId, client_id: clientId, cadence_seconds: cadenceSeconds(cadence) });
  }

  stop(clientId: string, monitorId: string, deleted: boolean): Promise<void> {
    return this.post(`/process-monitors/${encodeURIComponent(monitorId)}/stop`, { client_id: clientId, deleted });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    if (!this.config.juridicoWorkerInternalSecret) throw new ServiceUnavailableException('Worker de acompanhamento nao configurado');
    let response: Response;
    try {
      response = await fetch(`${this.config.workerJuridicoUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-jboot-worker-secret': this.config.juridicoWorkerInternalSecret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'process_monitoring_worker_unavailable', message: 'Worker de acompanhamento indisponivel' });
    }
    if (!response.ok) {
      throw new ServiceUnavailableException({ code: 'process_monitoring_worker_unavailable', message: 'Nao foi possivel agendar o acompanhamento' });
    }
  }
}
