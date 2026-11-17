import { Module } from '@nestjs/common';
import { CaptacaoController } from './captacao/captacao.controller';
import { CaptacaoRepository } from './captacao/captacao.repository';
import { CaptacaoService } from './captacao/captacao.service';
import { CredenciaisController } from './credenciais/credenciais.controller';
import { CredenciaisRepository } from './credenciais/credenciais.repository';
import { CredenciaisService } from './credenciais/credenciais.service';
import { EprocSessionController } from './eproc/eproc-session.controller';
import { EprocSessionService } from './eproc/eproc-session.service';
import { PjeController } from './pje/pje.controller';
import { PjeRepository } from './pje/pje.repository';
import { PjeService } from './pje/pje.service';
import { PjeDataClientService } from './pje/pje-data-client.service';
import { PortaisController } from './portais/portais.controller';
import { PortaisRepository } from './portais/portais.repository';
import { PortaisService } from './portais/portais.service';
import { CryptoService } from './shared/crypto.service';
import { DataJudClientService } from '../shared/juridico-data/datajud-client.service';
import { DataJudController } from './datajud/datajud.controller';
import { DataJudRepository } from './datajud/datajud.repository';
import { DataJudService } from './datajud/datajud.service';
import { DataJudMonitorController } from './datajud/datajud-monitor.controller';
import { ProcessMonitoringModule } from '../process-monitoring/process-monitoring.module';
import { DataJudMonitorService } from './datajud/datajud-monitor.service';
import { DataJudMonitorInternalController } from './datajud/datajud-monitor-internal.controller';
import { JuridicoWorkerAuthGuard } from './shared/juridico-worker-auth.guard';
import { DataJudMonitorCryptoService } from './shared/datajud-monitor-crypto.service';
import { DeadlineController } from './prazos/deadline.controller';
import { DeadlineRepository } from './prazos/deadline.repository';
import { DeadlineService } from './prazos/deadline.service';

@Module({
  imports: [ProcessMonitoringModule],
  controllers: [
    PortaisController,
    CredenciaisController,
    CaptacaoController,
    EprocSessionController,
    PjeController,
    DataJudController,
    DataJudMonitorController,
    DataJudMonitorInternalController,
    DeadlineController,
  ],
  providers: [
    PortaisRepository, PortaisService,
    CredenciaisRepository, CredenciaisService,
    CaptacaoRepository, CaptacaoService,
    EprocSessionService,
    PjeRepository, PjeDataClientService, PjeService,
    CryptoService,
    DataJudClientService, DataJudRepository, DataJudService,
    DataJudMonitorCryptoService, DataJudMonitorService,
    JuridicoWorkerAuthGuard,
    DeadlineRepository, DeadlineService,
  ],
  exports: [PjeRepository, DataJudRepository, DataJudMonitorCryptoService],
})
export class JuridicoModule {}
