import { Module } from '@nestjs/common';
import { MovementAutomationRepository } from './automation/movement-automation.repository';
import { MovementAutomationService } from './automation/movement-automation.service';
import { CardActionsController } from './actions/card-actions.controller';
import { CardActionsService } from './actions/card-actions.service';
import { CardActionsRepository } from './actions/card-actions.repository';
import { CardActionHandlers } from './actions/card-action-handlers.service';
import { CardActionsRateLimitGuard } from './actions/card-actions-rate-limit.guard';
import { EstablishmentCustomersModule } from '../establishment-customers/establishment-customers.module';
import { PlatformNotificationsModule } from '../notifications/platform-notifications.module';
import { ActivitiesController } from './activities/activities.controller';
import { ActivitiesRepository } from './activities/activities.repository';
import { ActivitiesService } from './activities/activities.service';
import { AssigneesController } from './assignees/assignees.controller';
import { AssigneesRepository } from './assignees/assignees.repository';
import { AssigneesService } from './assignees/assignees.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsRepository } from './attachments/attachments.repository';
import { AttachmentsService } from './attachments/attachments.service';
import { StorageService } from './attachments/storage.service';
import { ColumnAutomationRulesController } from './automation/automation-rules.controller';
import { AutomationRulesRepository } from './automation/automation-rules.repository';
import { AutomationRulesService } from './automation/automation-rules.service';
import { AutomationQueueService } from './automation/automation-queue.service';
import { AutomationWorker } from './automation/automation-worker.service';
import { DispatchLogRepository } from './automation/dispatch-log.repository';
import { EmailAutomationOutboxService } from './automation/email-automation-outbox.service';
import { EmailDispatchSchedulerService } from './automation/email-dispatch-scheduler.service';
import { EmailDispatchMetrics } from './automation/email-dispatch-metrics';
import { EmailDispatchesController } from './automation/email-dispatches.controller';
import { EmailDispatchesService } from './automation/email-dispatches.service';
import { MailerService } from './automation/mailer.service';
import { MailModule } from '../shared/mail/mail.module';
import { ScheduledAutomationRepository } from './automation/scheduled-automation.repository';
import { ScheduledAutomationEvaluatorService } from './automation/scheduled-automation-evaluator.service';
import { AiAutomationOutboxRepository } from './automation/ai-automation-outbox.repository';
import { AiGatewayClientService } from './automation/ai-gateway-client.service';
import { AiAutomationProcessorService } from './automation/ai-automation-processor.service';
import { AiAutomationSchedulerService } from './automation/ai-automation-scheduler.service';
import { BoardsController } from './boards/boards.controller';
import { BoardsRepository } from './boards/boards.repository';
import { BoardsService } from './boards/boards.service';
import { CardsController } from './cards/cards.controller';
import { ClaudeConnectorSettingsController } from './claude-connector/claude-connector-settings.controller';
import { ClaudeConnectorSettingsRepository } from './claude-connector/claude-connector-settings.repository';
import { ClaudeConnectorSettingsService } from './claude-connector/claude-connector-settings.service';
import { ConnectorRateLimiter } from './claude-connector/connector-rate-limiter';
import { ConnectorTokenIntrospector } from './claude-connector/connector-token.introspector';
import { FlowConnectorMcpController } from './claude-connector/flow-connector-mcp.controller';
import { FlowConnectorToolsService } from './claude-connector/flow-connector-tools.service';
import { CaseTypesController } from './case-types/case-types.controller';
import { CaseTypesRepository } from './case-types/case-types.repository';
import { CaseTypesService } from './case-types/case-types.service';
import { CardsRepository } from './cards/cards.repository';
import { CardsService } from './cards/cards.service';
import { ColumnsController } from './columns/columns.controller';
import { ColumnsRepository } from './columns/columns.repository';
import { ColumnsService } from './columns/columns.service';
import { CardCustomersController } from './customers/card-customers.controller';
import { CardCustomersRepository } from './customers/card-customers.repository';
import { CardCustomersService } from './customers/card-customers.service';
import { CardDocumentsController } from './documents/card-documents.controller';
import { CardDocumentsRepository } from './documents/card-documents.repository';
import { CardDocumentsService } from './documents/card-documents.service';
import { CardExtraDocumentsController } from './documents/card-extra-documents.controller';
import { CardExtraDocumentsRepository } from './documents/card-extra-documents.repository';
import { CardExtraDocumentsService } from './documents/card-extra-documents.service';
import { ChecklistGateService } from './documents/checklist-gate.service';
import { EntryRequirementsService } from './automation/entry-requirements.service';
import { CardHisconController } from './customers/card-hiscon.controller';
import { SignedKitController } from './signed-kit/signed-kit.controller';
import { SignedKitRepository } from './signed-kit/signed-kit.repository';
import { SignedKitService } from './signed-kit/signed-kit.service';
import { OfficeKitEmailController } from './office-kit-email/office-kit-email.controller';
import { OfficeKitEmailRepository } from './office-kit-email/office-kit-email.repository';
import { OfficeKitEmailService } from './office-kit-email/office-kit-email.service';
import { DocumentTypesController } from './documents/document-types.controller';
import { DocumentTypesRepository } from './documents/document-types.repository';
import { DocumentTypesService } from './documents/document-types.service';
import { DocumentTemplatesController } from './document-templates/document-templates.controller';
import { DocumentTemplatesRepository } from './document-templates/document-templates.repository';
import { DocumentTemplatesService } from './document-templates/document-templates.service';
import { TemplateValidationRunner } from './document-templates/template-validation-runner.service';
import { LeadAnalysisController } from './lead-analysis/lead-analysis.controller';
import { LeadAnalysisRepository } from './lead-analysis/lead-analysis.repository';
import { LeadAnalysisService } from './lead-analysis/lead-analysis.service';
import { LeadDocumentsController } from './lead-analysis/lead-documents.controller';
import { FlowCustomersController } from './flow-customers/flow-customers.controller';
import { CustomerDocumentsController } from './customer-documents/customer-documents.controller';
import { CustomerDocumentsRepository } from './customer-documents/customer-documents.repository';
import { CustomerDocumentsService } from './customer-documents/customer-documents.service';
import { CustomerValidationController } from './customer-validation/customer-validation.controller';
import { CustomerValidationRepository } from './customer-validation/customer-validation.repository';
import { CustomerValidationService } from './customer-validation/customer-validation.service';
import { AutomationCustomerService } from './customer-validation/automation-customer.service';
import { ActionAnalysisController } from './action-analysis/action-analysis.controller';
import { ActionAnalysisRepository } from './action-analysis/action-analysis.repository';
import { ActionAnalysisService } from './action-analysis/action-analysis.service';
import { DocumentRasterizerService } from './customer-validation/document-rasterizer.service';
import { CustomerIntakeCardService } from './customer-validation/customer-intake-card.service';
import { OfficeKitGenerationService } from './customer-validation/office-kit-generation.service';
import { CardOfficeKitController } from './customer-validation/card-office-kit.controller';
import { CardOfficeKitService } from './customer-validation/card-office-kit.service';
import { FlowCustomersRepository } from './flow-customers/flow-customers.repository';
import { FlowCustomersService } from './flow-customers/flow-customers.service';
import { FlowCustomerRateLimitGuard } from './flow-customers/flow-customer-rate-limit.guard';
import { DriveConfigurationController } from './drive/drive-configuration.controller';
import { DriveConfigurationRepository } from './drive/drive-configuration.repository';
import { DriveConfigurationService } from './drive/drive-configuration.service';
import { DriveTokenCipher } from './drive/drive-token-cipher.service';
import { GoogleDriveOAuthService } from './drive/google-drive-oauth.service';
import { DOCUMENT_SYNC_PORT } from './drive/document-sync.port';
import { GoogleDriveDocumentSyncAdapter } from './drive/google-drive-document-sync.adapter';
import { DocumentSyncController } from './drive/document-sync.controller';
import { DocumentSyncRepository } from './drive/document-sync.repository';
import { DocumentSyncQueueService } from './drive/document-sync-queue.service';
import { DocumentSyncService } from './drive/document-sync.service';
import { DocumentSyncWorker } from './drive/document-sync.worker';
import { CardLeadController } from './leads/card-lead.controller';
import { LeadEditLock } from './leads/lead-edit-lock.service';
import { LeadSettingsRepository } from './leads/lead-settings.repository';
import { LeadSettingsService } from './leads/lead-settings.service';
import { LeadsController } from './leads/leads.controller';
import { LeadsRepository } from './leads/leads.repository';
import { LeadsService } from './leads/leads.service';
import { MembersController } from './members/members.controller';
import { MembersRepository } from './members/members.repository';
import { MembersService } from './members/members.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsRepository } from './metrics/metrics.repository';
import { MetricsService } from './metrics/metrics.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsRepository } from './notifications/notifications.repository';
import { NotificationsService } from './notifications/notifications.service';
import { CardOfficePolicy } from './offices/card-office.policy';
import { ActiveOfficeService } from './offices/active-office.service';
import { OfficesController } from './offices/offices.controller';
import { OfficesRepository } from './offices/offices.repository';
import { OfficesService } from './offices/offices.service';
import { UserLawyersController } from './lawyers/user-lawyers.controller';
import { UserLawyersRepository } from './lawyers/user-lawyers.repository';
import { UserLawyersService } from './lawyers/user-lawyers.service';
import { HisconPrintService } from './initial-petitions/document/hiscon-print';
import { InitialPetitionsController } from './initial-petitions/initial-petitions.controller';
import { InitialPetitionsRepository } from './initial-petitions/initial-petitions.repository';
import { InitialPetitionsService } from './initial-petitions/initial-petitions.service';
import { PetitionProtocolRepository } from './initial-petitions/petition-protocol.repository';
import { PetitionProtocolService } from './initial-petitions/petition-protocol.service';
import { PetitionMonitoringService } from './actions/petition-monitoring.service';
import { ProcessImportCardsService } from './process-import/process-import-cards.service';
import { ProcessImportRepository } from './process-import/process-import.repository';
import { PetitionPreconditionsService } from './initial-petitions/petition-preconditions.service';
import { PriorLawsuitsController } from './prior-lawsuits/prior-lawsuits.controller';
import { PriorLawsuitsRepository } from './prior-lawsuits/prior-lawsuits.repository';
import { PriorLawsuitsService } from './prior-lawsuits/prior-lawsuits.service';
import { ServiceContractController } from './offices/service-contract/service-contract.controller';
import { ServiceContractRepository } from './offices/service-contract/service-contract.repository';
import { ServiceContractService } from './offices/service-contract/service-contract.service';
import { DocumentPdfQueueService } from './pdf/document-pdf-queue.service';
import { DocumentPdfRepository } from './pdf/document-pdf.repository';
import { DocumentPdfService } from './pdf/document-pdf.service';
import { DocumentPdfWorker } from './pdf/document-pdf.worker';
import { PdfConverterClient } from './pdf/pdf-converter.client';
import { ColumnPermissionsRepository } from './profiles/column-permissions.repository';
import { ProfileTransitionsRepository } from './profiles/profile-transitions.repository';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesRepository } from './profiles/profiles.repository';
import { ProfilesService } from './profiles/profiles.service';
import { FlowLiveEvents } from './realtime/flow-live-events';
import { KanbanGateway } from './realtime/kanban.gateway';
import { BoardAccessService } from './shared/board-access.service';
import { CardVisibilityService } from './shared/card-visibility.service';
import { FlowAdminDirectory } from './shared/flow-admin-directory.service';
import { KanbanViewerResolver } from './shared/kanban-viewer-resolver.service';
import { KanbanAuditService } from './shared/kanban-audit.service';
import { StatusesController } from './statuses/statuses.controller';
import { StatusesRepository } from './statuses/statuses.repository';
import { StatusesService } from './statuses/statuses.service';
import { CardTagsController } from './tags/card-tags.controller';
import { TagsController } from './tags/tags.controller';
import { TagsRepository } from './tags/tags.repository';
import { TagsService } from './tags/tags.service';
import { FlowIdentityClient } from './user-provisioning/flow-identity.client';
import { UserProvisioningController } from './user-provisioning/user-provisioning.controller';
import { UserProvisioningRepository } from './user-provisioning/user-provisioning.repository';
import { UserProvisioningService } from './user-provisioning/user-provisioning.service';

@Module({
  // EstablishmentCustomersModule: cliente final do card (CRM de leads) somente via
  // CustomersService/CustomerJuridicoService exportados; kanban nao le tabela de cliente.
  imports: [PlatformNotificationsModule, EstablishmentCustomersModule, MailModule],
  controllers: [
    CardActionsController,
    ClaudeConnectorSettingsController,
    FlowConnectorMcpController,
    BoardsController,
    ColumnsController,
    CardsController,
    CardCustomersController,
    ActionAnalysisController,
    DocumentTypesController,
    CardDocumentsController,
    CardExtraDocumentsController,
    MembersController,
    MetricsController,
    NotificationsController,
    ProfilesController,
    AssigneesController,
    ActivitiesController,
    AttachmentsController,
    TagsController,
    CardTagsController,
    StatusesController,
    ColumnAutomationRulesController,
    EmailDispatchesController,
    OfficesController,
    ServiceContractController,
    UserLawyersController,
    PriorLawsuitsController,
    InitialPetitionsController,
    CardLeadController,
    LeadsController,
    CaseTypesController,
    DocumentTemplatesController,
    LeadAnalysisController,
    LeadDocumentsController,
    FlowCustomersController,
    CustomerDocumentsController,
    CustomerValidationController,
    CardOfficeKitController,
    CardHisconController,
    SignedKitController,
    OfficeKitEmailController,
    DriveConfigurationController,
    DocumentSyncController,
    UserProvisioningController
  ],
  providers: [
    MovementAutomationRepository,
    MovementAutomationService,
    CardActionsService,
    CardActionsRepository,
    CardActionHandlers,
    CardActionsRateLimitGuard,
    ClaudeConnectorSettingsRepository,
    ClaudeConnectorSettingsService,
    ConnectorTokenIntrospector,
    ConnectorRateLimiter,
    FlowConnectorToolsService,
    AutomationRulesRepository,
    AutomationRulesService,
    AutomationQueueService,
    AutomationWorker,
    DispatchLogRepository,
    EmailAutomationOutboxService,
    EmailDispatchSchedulerService,
    EmailDispatchMetrics,
    EmailDispatchesService,
    MailerService,
    ScheduledAutomationRepository,
    ScheduledAutomationEvaluatorService,
    AiAutomationOutboxRepository,
    AiGatewayClientService,
    AiAutomationProcessorService,
    AiAutomationSchedulerService,
    BoardsRepository,
    BoardsService,
    ColumnsRepository,
    ColumnsService,
    CardsRepository,
    CardsService,
    CardCustomersRepository,
    CardCustomersService,
    DocumentTypesRepository,
    DocumentTypesService,
    CardDocumentsRepository,
    CardDocumentsService,
    CardExtraDocumentsRepository,
    CardExtraDocumentsService,
    ChecklistGateService,
    EntryRequirementsService,
    MembersRepository,
    MembersService,
    MetricsRepository,
    MetricsService,
    NotificationsRepository,
    NotificationsService,
    ProfilesRepository,
    ProfileTransitionsRepository,
    ColumnPermissionsRepository,
    ProfilesService,
    AssigneesRepository,
    AssigneesService,
    ActivitiesRepository,
    ActivitiesService,
    AttachmentsRepository,
    AttachmentsService,
    StorageService,
    TagsRepository,
    TagsService,
    StatusesRepository,
    StatusesService,
    BoardAccessService,
    // Visibilidade por escritorio (Sprint 3.5): ponto unico + diretorio de admins + escritorios.
    KanbanViewerResolver,
    CardVisibilityService,
    FlowAdminDirectory,
    OfficesRepository,
    OfficesService,
    ServiceContractRepository,
    ServiceContractService,
    UserLawyersRepository,
    UserLawyersService,
    PriorLawsuitsRepository,
    PriorLawsuitsService,
    PetitionPreconditionsService,
    HisconPrintService,
    InitialPetitionsRepository,
    InitialPetitionsService,
    PetitionProtocolRepository,
    PetitionProtocolService,
    PetitionMonitoringService,
    ProcessImportRepository,
    ProcessImportCardsService,
    CardOfficePolicy,
    ActiveOfficeService,
    FlowCustomersRepository,
    FlowCustomersService,
    CustomerDocumentsRepository,
    CustomerDocumentsService,
    CustomerValidationRepository,
    CustomerValidationService,
    AutomationCustomerService,
    ActionAnalysisRepository,
    ActionAnalysisService,
    DocumentRasterizerService,
    CustomerIntakeCardService,
    OfficeKitGenerationService,
    CardOfficeKitService,
    SignedKitRepository,
    SignedKitService,
    OfficeKitEmailRepository,
    OfficeKitEmailService,
    FlowCustomerRateLimitGuard,
    DriveConfigurationRepository,
    DriveConfigurationService,
    DriveTokenCipher,
    GoogleDriveOAuthService,
    GoogleDriveDocumentSyncAdapter,
    { provide: DOCUMENT_SYNC_PORT, useExisting: GoogleDriveDocumentSyncAdapter },
    DocumentSyncRepository,
    DocumentSyncQueueService,
    DocumentSyncService,
    DocumentSyncWorker,
    // Envio do lead e fila do gestor (CRM de leads, Sprint 4).
    LeadsRepository,
    LeadSettingsRepository,
    LeadEditLock,
    LeadsService,
    LeadSettingsService,
    // Tipos de caso e modelos de documento (CRM de leads, Sprint 5).
    CaseTypesRepository,
    CaseTypesService,
    DocumentTemplatesRepository,
    DocumentTemplatesService,
    TemplateValidationRunner,
    // Analise do lead, documento gerado e PDF (CRM de leads, Sprint 6).
    LeadAnalysisRepository,
    LeadAnalysisService,
    PdfConverterClient,
    DocumentPdfRepository,
    DocumentPdfQueueService,
    DocumentPdfService,
    DocumentPdfWorker,
    KanbanAuditService,
    FlowIdentityClient,
    UserProvisioningRepository,
    UserProvisioningService,
    FlowLiveEvents,
    KanbanGateway
  ],
  exports: [
    BoardsRepository,
    CardsService,
    ActivitiesService,
    CardsRepository,
    ColumnsRepository,
    EmailAutomationOutboxService,
    AutomationRulesRepository,
    AutomationQueueService,
    // Integracoes de dominio aplicam a mesma visibilidade de card/escritorio do Flow.
    CardVisibilityService,
    BoardAccessService,
    KanbanViewerResolver,
    OfficesRepository,
    // Acao Monitorar: domain-integrations cria o card de monitoramento e liga o monitor DataJud.
    PetitionMonitoringService,
    // Importacao de processos por planilha: domain-integrations orquestra lote, monitor e vinculo.
    ProcessImportCardsService,
    ProcessImportRepository
  ]
})
export class KanbanModule {}
