import { Injectable } from '@nestjs/common';

// Banco exclusivo do acompanhamento de processos (ADR 021), unico para todos os clientes.
const PROCESS_MONITORING_DATABASE_URL =
  process.env.JBOOT_PROCESS_MONITORING_DATABASE_URL ??
  process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_process_monitoring') ??
  'postgresql://jboot:jboot@postgres:5432/jboot_process_monitoring';

@Injectable()
export class AppConfigService {
  readonly port = Number(process.env.PDV_PORT ?? process.env.PORT ?? 8010);
  readonly databaseUrl =
    process.env.JBOOT_PDV_DATABASE_URL ??
    process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_pdv') ??
    'postgresql://jboot:jboot@postgres:5432/jboot_pdv';
  readonly identityDatabaseUrl =
    process.env.JBOOT_IDENTITY_DATABASE_URL ??
    process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_identity') ??
    'postgresql://jboot:jboot@postgres:5432/jboot_identity';
  readonly connectionUrls: Readonly<Record<string, string>> = {
    'postgres.identity':
      process.env.JBOOT_IDENTITY_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_identity') ??
      'postgresql://jboot:jboot@postgres:5432/jboot_identity',
    'postgres.pdv':
      process.env.JBOOT_PDV_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_pdv') ??
      'postgresql://jboot:jboot@postgres:5432/jboot_pdv',
    'postgres.juridico':
      process.env.JBOOT_JURIDICO_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_juridico_advocacia_dev') ??
      'postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev',
    'postgres.platform':
      process.env.JBOOT_PLATFORM_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_identity') ??
      'postgresql://jboot:jboot@postgres:5432/jboot_identity',
    'postgres.kanban':
      process.env.JBOOT_KANBAN_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/jboot_kanban_demo_dev') ??
      'postgresql://jboot:jboot@postgres:5432/jboot_kanban_demo_dev',
    'postgres.process-monitoring': PROCESS_MONITORING_DATABASE_URL
  };
  readonly processMonitoringConnection = 'postgres.process-monitoring';
  readonly processMonitoringDatabaseName = new URL(PROCESS_MONITORING_DATABASE_URL).pathname.replace(/^\//, '');
  readonly jwtSecret =
    process.env.JBOOT_IDENTITY_JWT_SECRET ??
    'dev-only-jboot-identity-secret-change-before-production';
  readonly identityIssuer = process.env.JBOOT_IDENTITY_ISSUER ?? 'jboot-identity';
  readonly workerJuridicoUrl =
    process.env.JBOOT_JURIDICO_WORKER_URL ?? 'http://localhost:8020';
  readonly juridicoDataServiceUrl =
    process.env.JBOOT_JURIDICO_DATA_SERVICE_URL ?? 'http://localhost:8030';
  readonly identityServiceUrl = process.env.JBOOT_IDENTITY_SERVICE_URL ?? 'http://localhost:8000';
  // Conector Claude do Flow (docs/product/kanban-claude-connector-sprints.md):
  // URL publica exata do MCP (= `resource` dos tokens) e issuer OAuth do Identity.
  readonly flowConnectorResourceUrl = process.env.JBOOT_FLOW_CONNECTOR_RESOURCE_URL || 'http://localhost:8010/kanban/mcp';
  readonly identityOAuthIssuerUrl = (process.env.JBOOT_IDENTITY_OAUTH_ISSUER_URL || 'http://localhost:8000').replace(/\/+$/, '');
  readonly paymentsServiceUrl = process.env.JBOOT_PAYMENTS_SERVICE_URL ?? 'http://localhost:8040';
  readonly aiGatewayServiceUrl = process.env.JBOOT_AI_GATEWAY_SERVICE_URL ?? 'http://127.0.0.1:8050';
  readonly platformServiceClientId = 'platform-api';
  readonly juridicoWorkerServiceClientId = 'juridico-worker';
  readonly juridicoWorkerInternalSecret = process.env.JBOOT_JURIDICO_WORKER_INTERNAL_SECRET ?? '';
  // Chave exclusiva do monitoramento; nunca reutiliza segredo de sessão/JWT.
  readonly juridicoMonitorEncryptionKey = process.env.JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY ?? '';
  readonly juridicoMonitorEncryptionKeyVersion = Number(process.env.JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY_VERSION ?? 1);
  readonly platformServiceClientSecret = process.env.JBOOT_PLATFORM_SERVICE_CLIENT_SECRET ?? '';
  readonly userProvisioningHmacKey = process.env.JBOOT_USER_PROVISIONING_HMAC_KEY ??
    'dev-only-flow-user-provisioning-hmac-change-before-production';
  readonly juridicoDataAuditHmacKey = process.env.JBOOT_JURIDICO_DATA_AUDIT_HMAC_KEY ?? '';
  readonly juridicoDataAuditHmacKeyVersion = Number(
    process.env.JBOOT_JURIDICO_DATA_AUDIT_HMAC_KEY_VERSION ?? 1,
  );
  // Retencao do snapshot de consulta manual DataJud. Mesma janela ja usada na
  // purga de monitoramento; ver docs/product/juridico-datajud-flow-sprints.md.
  readonly juridicoDataSnapshotRetentionDays = Number(
    process.env.JBOOT_JURIDICO_DATA_SNAPSHOT_RETENTION_DAYS ?? 180,
  );
  // Drive por cliente: um unico app OAuth do JBoot no Google Cloud; cada cliente
  // autoriza a propria conta. Os refresh tokens ficam cifrados no banco do tenant.
  readonly flowDrive = {
    oauthClientId: process.env.JBOOT_FLOW_DRIVE_OAUTH_CLIENT_ID ?? '',
    oauthClientSecret: process.env.JBOOT_FLOW_DRIVE_OAUTH_CLIENT_SECRET ?? '',
    pickerApiKey: process.env.JBOOT_FLOW_DRIVE_PICKER_API_KEY ?? '',
    pickerAppId: process.env.JBOOT_FLOW_DRIVE_PICKER_APP_ID ?? '',
    encryptionKey: process.env.JBOOT_FLOW_DRIVE_ENCRYPTION_KEY ?? ''
  };
  readonly corsOrigins = (
    process.env.CORS_ORIGINS ??
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  readonly s3 = {
    // Endpoint interno (rede docker), usado para upload/HEAD/CreateBucket — nunca exposto ao browser.
    endpoint: process.env.S3_ENDPOINT ?? 'http://minio:9000',
    // Endpoint publico, usado so para assinar URLs de download que o browser do usuario vai resolver
    // de fato. Precisa ser diferente do endpoint interno (hostname "minio" nao resolve fora da rede
    // docker); em producao, deve apontar para o dominio publico do MinIO/CDN.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? 'http://localhost:9000',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'jboot',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'jbootsecret',
    region: process.env.S3_REGION ?? 'us-east-1'
  };
  readonly kanbanAttachmentsBucket = process.env.JBOOT_KANBAN_ATTACHMENTS_BUCKET ?? 'kanban-card-attachments';
  // Conversor .docx -> PDF do CRM de leads do Flow (Sprint 6; ADR 014, Decisao 2): Gotenberg na
  // rede interna `jboot-pdf-internal`, basic auth. URL e credenciais vem do docker-compose.yml
  // (servico `jboot`), derivadas das mesmas variaveis do servico `gotenberg`; sem URL configurada o
  // PDF fica `failed` com `converter_not_configured` (a aprovacao nunca e desfeita).
  readonly pdfConverter = {
    url: (process.env.JBOOT_PDF_CONVERTER_URL ?? '').trim(),
    user: process.env.JBOOT_PDF_CONVERTER_USER ?? '',
    password: process.env.JBOOT_PDF_CONVERTER_PASSWORD ?? '',
    timeoutMs: 60_000
  };
  // Broker BullMQ do motor de automacao por coluna do Kanban (Sprint 8). Excecao autorizada
  // ao uso de Valkey neste modulo (fila de job assincrono, nao pub/sub de broadcast realtime) —
  // ver MODULE_CONTRACT.md, secao "Restricoes". Mesma URL ja usada pelo container `jboot`.
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://valkey:6379';
  // SMTP generico (nodemailer) do MailService comum da plataforma (shared/mail); o MailerService do
  // Flow monta os textos e envia por ele. Em dev,
  // aponta para o Mailpit local (docker-compose.yml, servico `mailpit`). Trocar de provedor no
  // futuro e so trocar estas envs (relay SMTP), sem reescrever codigo.
  readonly smtp = {
    host: process.env.SMTP_HOST ?? 'mailpit',
    port: Number(process.env.SMTP_PORT ?? 1025),
    // TLS direto (porta 465). Sem a env, segue a porta: 465 liga, as demais (587 STARTTLS, Mailpit) nao.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT ?? 1025) === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'flow@jboot.local'
  };
  readonly platformFilesBucket = process.env.JBOOT_PLATFORM_FILES_BUCKET ?? 'platform-files';
  readonly fiscalServiceUrl = process.env.JBOOT_FISCAL_SERVICE_URL ?? 'http://localhost:8090';
  readonly fiscalInternalSecret =
    process.env.JBOOT_FISCAL_INTERNAL_SECRET ?? 'dev-only-fiscal-internal-secret-change-in-production';
  // Segredos JWT do modulo `comanda` (autoatendimento publico via QR de mesa).
  // Deliberadamente independentes entre si e do JBOOT_IDENTITY_JWT_SECRET —
  // ver "Dois lados, dois modelos de autenticacao" em
  // modules/comanda/MODULE_CONTRACT.md. Nunca reutilizar `jwtSecret` aqui.
  readonly comandaQrSecret =
    process.env.JBOOT_COMANDA_QR_SECRET ?? 'dev-only-jboot-comanda-qr-secret-change-before-production';
  readonly comandaSessionSecret =
    process.env.JBOOT_COMANDA_SESSION_SECRET ?? 'dev-only-jboot-comanda-session-secret-change-before-production';

}
