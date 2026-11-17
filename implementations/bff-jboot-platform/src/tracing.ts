// Bootstrap de OpenTelemetry. Precisa ser o PRIMEIRO import de `main.ts`,
// antes de qualquer outro modulo (Nest, pg, ioredis, bullmq, express) ser
// carregado — a auto-instrumentacao funciona via monkey-patch no `require`,
// entao so instrumenta modulos ainda nao carregados no momento do `start()`.
//
// So inicia se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido (setado pelo
// `docker-compose.yml` do target `code-up`, apontando para o `otel-collector`
// local). Sem isso (ex: `npm test` no host, CI), fica no-op — evita tentativa
// de conexao/retry contra um collector inexistente.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (otlpEndpoint) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'bff-jboot-platform';
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0'
    }),
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
      exportIntervalMillis: 15000
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Ruidoso e pouco util no NestJS: cada require() interno gera um
        // span. As instrumentacoes de http/express/pg/ioredis/nestjs
        // continuam ativas (default).
        '@opentelemetry/instrumentation-fs': { enabled: false }
      })
    ]
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
