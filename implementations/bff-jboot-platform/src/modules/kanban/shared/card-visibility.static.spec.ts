import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

/**
 * Garantia estatica do ponto unico de visibilidade (CRM de leads, Sprint 3.5;
 * ADR 014, Decisao 6): todo SQL do backend que le ou altera `kanban_cards` ou
 * tabela filha de card precisa estar numa funcao que aplica
 * `visibleCardScope(...)` OU constar desta allowlist com o motivo. Entrada que
 * deixa de corresponder a SQL real reprova (allowlist sem lixo).
 *
 * Categorias:
 * - `post_check`: consulta por id de card DEPOIS de `requireVisibleCard` (ou do
 *   proprio `CardVisibilityService`) no servico chamador;
 * - `write`: escrita interna em card ja autorizado pelo servico;
 * - `admin`: operacao/agregado exclusivo de `flow:admin` (escritorios);
 * - `worker`: fora de requisicao (automacao); destinatario filtrado por
 *   `identitiesWhoSeeCard` no envio;
 * - `rule`: verificacao interna que devolve so booleano/ids, nunca conteudo.
 */
const ALLOWLIST: Record<string, string> = {
  // ADR 019, decisao 16: card automatico na confirmacao da validacao (acao do sistema, nao listagem do usuario).
  'modules/kanban/customer-validation/customer-validation.repository.ts#CustomerValidationRepository.findActiveCustomerCard':
    'system: so devolve o id do card ativo do cliente no board de entrada para nao duplicar; chamado apos a confirmacao com flow:validation:approve, sem expor dado do card',
  'modules/kanban/automation/movement-automation.repository.ts#MovementAutomationRepository.recover':
    'worker: seleciona somente IDs para regras move_card do tenant; executor revalida owner, requireVisibleCard e movimento canonico',
  'modules/kanban/automation/ai-automation-outbox.repository.ts#recordAutomationCompleted':
    'worker: mesmo evento de completeConfirmed, dentro da transacao que encerrou o run do dono (analise de acoes, peticoes); nao expoe conteudo de card',
  'modules/kanban/automation/ai-automation-outbox.repository.ts#AiAutomationOutboxRepository.completeConfirmed':
    'worker: evento de confirmacao vinculado ao run e ao mesmo tenant/card/owner; nao expoe conteudo de card',
  // Acao Monitorar (docs/product/flow-card-actions-sprints.md, Sprint 2): peticao do card ja autorizado.
  'modules/kanban/initial-petitions/petition-protocol.repository.ts#PETITION_SELECT':
    'post_check: peticoes por card_id depois de requireVisibleCard (registro do CNJ) ou requireExecutable (acao Monitorar)',
  'modules/kanban/initial-petitions/petition-protocol.repository.ts#PetitionProtocolRepository.isCardAssignee':
    'rule: booleano de responsavel do card ja autorizado por requireVisibleCard; nao expoe conteudo',
  'modules/kanban/initial-petitions/petition-protocol.repository.ts#PetitionProtocolRepository.register':
    'write: apos requireVisibleCard e permissao; a unicidade devolve so card/board do numero ja usado para o aviso de duplicidade decidido pelo usuario',
  'modules/kanban/initial-petitions/petition-protocol.repository.ts#PetitionProtocolRepository.discardLosingCard':
    'write: exclusao logica do card que o proprio pedido acabou de criar (corrida perdida), restrita a origem flow_petition da peticao',
  // Importacao de processos por planilha (docs/product/flow-process-import-sprints.md).
  'modules/kanban/process-import/process-import.repository.ts#ProcessImportRepository.findProcessOwners':
    'rule: unicidade do numero CNJ no tenant; devolve so card/board do numero ja usado para o aviso de duplicidade decidido pelo usuario (mesma regra do registro em peticao)',
  'modules/kanban/process-import/process-import.repository.ts#ProcessImportRepository.addAssignees':
    'write: card recem-criado pelo lote; ids ja filtrados por identitiesWhoSeeCard (responsaveis do escritorio que enxergam o card)',
  'modules/kanban/actions/card-actions.repository.ts#CardActionsRepository.confirmExecution':
    'write: card previamente autorizado por requireVisibleCard; lock tenant/board/card confirma coluna e estado atuais antes da auditoria',
  // Repositorio de card: leituras por id usadas pelo proprio ponto unico e escritas apos requireVisibleCard.
  'modules/kanban/cards/cards.repository.ts#CardsRepository.findById':
    'post_check: base do CardVisibilityService.requireVisibleCard; demais chamadores sao worker/integracao por id',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.findByIdForClient':
    'post_check: so resolve o boardId do card em rota sem :boardId (domain-integrations); FlowCardMonitoringService aplica requireVisibleCard em seguida',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.create': 'write: insercao apos requireRole + CardOfficePolicy',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.createFromSource':
    'write: importacao de dominio apos requireRole + CardOfficePolicy; dedup por origem no mesmo quadro',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.update': 'write: apos requireVisibleCard',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.updateStatus': 'write: apos requireVisibleCard',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.softDelete': 'write: apos requireVisibleCard',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.countActiveInColumn':
    'rule: limite WIP conta a coluna inteira (regra de estrutura, nao exposta como lista); devolve so numero',
  'modules/kanban/cards/cards.repository.ts#CardsRepository.move': 'write: reordenacao da coluna apos requireVisibleCard',
  // Filhos do card: sempre por card_id ja validado.
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.list': 'post_check: card_id apos requireVisibleCard',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.findById':
    'post_check: card_id apos requireVisibleCard (worker: card ja resolvido)',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.createComment': 'write: apos requireVisibleCard',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.findRecentConnectorComment':
    'post_check: comentario do proprio autor via conector Claude, apos requireVisibleCard (dedupe de reenvio)',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.createSystemEvent':
    'write: apos requireVisibleCard ou integracao de dominio por card vinculado',
  'modules/kanban/assignees/assignees.repository.ts#AssigneesRepository.list':
    'post_check: card_id apos requireVisibleCard; destinatarios filtrados por identitiesWhoSeeCard',
  'modules/kanban/assignees/assignees.repository.ts#AssigneesRepository.create':
    'write: apos requireVisibleCard e identitiesWhoSeeCard do responsavel',
  'modules/kanban/assignees/assignees.repository.ts#AssigneesRepository.remove': 'write: apos requireVisibleCard',
  'modules/kanban/attachments/attachments.repository.ts#AttachmentsRepository.list': 'post_check: activity do card visivel',
  'modules/kanban/attachments/attachments.repository.ts#AttachmentsRepository.findById': 'post_check: activity do card visivel',
  'modules/kanban/attachments/attachments.repository.ts#AttachmentsRepository.create': 'write: activity do card visivel',
  'modules/kanban/documents/card-documents.repository.ts#CardDocumentsRepository.findLatestIdForType': 'post_check: card visivel',
  'modules/kanban/documents/card-documents.repository.ts#CardDocumentsRepository.createUpload': 'write: card visivel',
  'modules/kanban/documents/card-documents.repository.ts#CardDocumentsRepository.review': 'write: card visivel',
  'modules/kanban/documents/card-documents.repository.ts#LATEST_PER_CARD_TYPE':
    'fragmento interpolado so em listPendingRequired (por card, gate de coluna) e completenessForBoard (escopado)',
  'modules/kanban/documents/card-documents.repository.ts#DOCUMENT_FROM':
    'fragmento interpolado so em consultas por card_id/id de documento de card visivel (listForCard, findById, createUpload, review)',
  'modules/kanban/documents/card-extra-documents.repository.ts#EXTRA_FROM':
    'fragmento interpolado so em consultas por card_id/id de avulso de card visivel (listActive, findActive, create)',
  'modules/kanban/documents/card-extra-documents.repository.ts#CardExtraDocumentsRepository.create': 'write: card visivel',
  'modules/kanban/documents/card-extra-documents.repository.ts#CardExtraDocumentsRepository.remove': 'write: card visivel',
  'modules/kanban/automation/entry-requirements.service.ts#EntryRequirementsService.assertCanEnterColumn':
    'post_check: card visivel (CardsService.move confere antes)',
  'modules/kanban/automation/entry-requirements.service.ts#EntryRequirementsService.cardWithoutHiscon':
    'post_check: card visivel (CardHisconController confere antes)',
  'modules/kanban/customers/card-customers.repository.ts#CardCustomersRepository.findByCard': 'post_check: card visivel',
  'modules/kanban/customers/card-customers.repository.ts#CardCustomersRepository.replace': 'write: card visivel e editavel',
  'modules/kanban/customers/card-customers.repository.ts#CardCustomersRepository.isCrossOfficeLink':
    'rule: P30, devolve so booleano para exigir o override do admin',
  'modules/kanban/flow-customers/flow-customers.repository.ts#FlowCustomersRepository.createCardFromCustomer':
    'write: comando idempotente apos customer policy, board role, office, ACL e checklist; replay revalida card e vinculo',
  'modules/kanban/flow-customers/flow-customers.repository.ts#FlowCustomersRepository.linkExistingCard':
    'write: vinculo e auditoria atomicos apos requireVisibleCard e ACL da coluna',
  'modules/kanban/tags/tags.repository.ts#TagsRepository.listForCard': 'post_check: card visivel',
  'modules/kanban/tags/tags.repository.ts#TagsRepository.attach': 'write: card visivel',
  'modules/kanban/tags/tags.repository.ts#TagsRepository.detach': 'write: card visivel',
  'modules/kanban/metrics/metrics.repository.ts#MetricsRepository.getMovedEventsForCards':
    'post_check: ids vindos de getCardsForLeadTime, ja no escopo unico',
  // Escritorios: exclusivo de flow:admin (scope no controller + requireAdmin no servico).
  'modules/kanban/offices/offices.repository.ts#OfficesRepository.list': 'admin: contagem de cards por escritorio',
  'modules/kanban/offices/offices.repository.ts#OfficesRepository.removeAssignmentsInOffices':
    'admin: P28, saida de escritorio remove o usuario dos responsaveis com system_event',
  'modules/kanban/offices/offices.repository.ts#OfficesRepository.assignCardsWithoutOffice': 'admin: atribuicao em lote',
  'modules/kanban/offices/offices.repository.ts#OfficesRepository.transferCard': 'admin: transferencia apos requireVisibleCard',
  'modules/kanban/offices/offices.repository.ts#OfficesRepository.countCardsWithoutOfficeByBoard':
    'admin: pre-visualizacao da ativacao (so contagem)',
  // Estado do lead e ciclos de envio (Sprint 4): por card_id apos requireVisibleCard; transicoes com lock do card.
  'modules/kanban/leads/leads.repository.ts#LeadsRepository.findStatus':
    'post_check: estado do card ja visivel (LeadEditLock e LeadsService apos requireVisibleCard)',
  'modules/kanban/leads/leads.repository.ts#LeadsRepository.findByCard': 'post_check: card visivel (GET/POST lead)',
  'modules/kanban/leads/leads.repository.ts#LeadsRepository.listSubmissions': 'post_check: card visivel (GET/POST lead)',
  'modules/kanban/leads/leads.repository.ts#LeadsRepository.submit': 'write: envio apos requireVisibleCard + papel + coluna editavel',
  'modules/kanban/leads/leads.repository.ts#LeadsRepository.returnToOffice': 'write: devolucao apos flow:admin + requireVisibleCard',
  'modules/kanban/leads/leads.repository.ts#lockAndReadStatus': 'write: lock do card dentro de submit/returnToOffice',
  'modules/kanban/leads/leads.repository.ts#upsertLeadStatus': 'write: transicao dentro de submit/returnToOffice',
  'modules/kanban/leads/leads.repository.ts#insertLeadEvent': 'write: system_event dentro de submit/returnToOffice',
  // Analise do lead e documentos gerados (Sprint 6): por card_id apos requireVisibleCard; mutacoes com lock do card.
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.listCases':
    'post_check: casos do ciclo do card visivel (GET analysis, so flow:admin)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.findCase': 'post_check: caso do card visivel (geracao)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.findDocument':
    'post_check: documento do card visivel (download do gestor; escritorio so aprovado do ciclo atual)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.listDelivered':
    'post_check: aprovados do ciclo atual do card visivel (P11, visao do escritorio)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.requestPdfRetry':
    'write: nova tentativa do PDF apos flow:admin + requireVisibleCard',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.inAnalysis':
    'write: lock do card e do estado do lead e transicao, dentro das mutacoes da analise (flow:admin + requireVisibleCard)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.insertGenerated':
    'write: rascunho novo apos flow:admin + requireVisibleCard',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.approve': 'write: aprovacao apos flow:admin + requireVisibleCard',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#LeadAnalysisRepository.insertEdited':
    'write: versao editada apos flow:admin + requireVisibleCard',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#DOCUMENT_FROM':
    'fragmento interpolado so em consultas por card_id/id de documento de card visivel (listDocuments e findDocument, apos requireVisibleCard)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#analysisFacts': 'rule: contagens do ciclo para a transicao do estado (so numeros)',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#checkCaseType': 'rule: duplicidade/limite de casos dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#insertCase': 'write: caso dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#lockActiveCase': 'write: lock do caso dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#supersedeCase': 'write: troca/remocao auditada dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#supersedeApproved': 'write: aprovado anterior substituido dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#nextVersion': 'rule: numero da proxima versao do caso dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#lockDocument': 'write: lock do documento dentro de inAnalysis',
  'modules/kanban/lead-analysis/lead-analysis.repository.ts#insertEvent': 'write: system_event dentro de inAnalysis',
  // Fora de requisicao.
  'modules/kanban/pdf/document-pdf.repository.ts#DocumentPdfRepository.claim':
    'worker: claim do PDF por id de documento aprovado (job sem dado pessoal); nada e devolvido a usuario',
  'modules/kanban/pdf/document-pdf.repository.ts#DocumentPdfRepository.complete': 'worker: resultado do PDF por id de documento',
  'modules/kanban/pdf/document-pdf.repository.ts#DocumentPdfRepository.recordFailure': 'worker: falha do PDF por id de documento',
  'modules/kanban/pdf/document-pdf.repository.ts#DocumentPdfRepository.listStalePending':
    'worker: relay da outbox do PDF (so ids, reenfileirados para o proprio worker)',
  'modules/kanban/drive/document-sync.repository.ts#DocumentSyncRepository.source':
    'worker: origem tenant-scoped do item ja reservado da outbox Drive (chave canonica, card/escritorio/cliente para a pasta); metadados internos ao worker, nunca conteudo a usuario',
  'modules/kanban/drive/document-sync.repository.ts#DocumentSyncRepository.reconcileMissing':
    'worker: reconciliacao tenant-scoped cria outbox ausente somente para documentos canonicos aprovados; nao retorna conteudo a usuario',
  'modules/kanban/automation/scheduled-automation.repository.ts#ScheduledAutomationRepository.findDueDateApproachingCandidates':
    'worker: candidatos do agendador; destinatario filtrado por identitiesWhoSeeCard no envio',
  'modules/kanban/automation/scheduled-automation.repository.ts#ScheduledAutomationRepository.findCardStaleCandidates':
    'worker: candidatos do agendador; destinatario filtrado por identitiesWhoSeeCard no envio',
  'modules/kanban/automation/dispatch-log.repository.ts#reactiveIntentSql':
    'worker: deriva a intencao de e-mail do evento do card (so ids); destinatario filtrado por identitiesWhoSeeCard no envio',
  'modules/kanban/automation/dispatch-log.repository.ts#DispatchLogRepository.claim':
    'worker: retoma a linha do outbox e le so o quadro do card; destinatario filtrado por identitiesWhoSeeCard no envio',
  'modules/kanban/automation/dispatch-log.repository.ts#DispatchLogRepository.findTarget':
    'post_check: so ids da linha; o servico aplica requireVisibleCard + board_admin antes de reprocessar',
  'modules/kanban/automation/ai-automation-outbox.repository.ts#AiAutomationOutboxRepository.recoverMissing':
    'worker: relay tenant-scoped deriva outbox somente de card.moved canonico e regra ativa; nao responde a usuario',
  'modules/kanban/automation/ai-automation-outbox.repository.ts#AiAutomationOutboxRepository.snapshot':
    'worker: snapshot tenant/board/card/source-activity fechado para a execucao ja autorizada pela regra',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.createAiComment':
    'worker: efeito automatico allowlisted, tenant/card reautorizados e idempotente por execution/tool call',
  'modules/kanban/activities/activities.repository.ts#ActivitiesRepository.createAiReviewRequest':
    'worker: registra somente pedido de revisao, sem aplicar mutacao protegida; idempotente por execution/tool call',
  // Peticoes iniciais (ADR 020, S5): o servico chama requireVisibleCard antes de cada uso.
  'modules/kanban/initial-petitions/initial-petitions.repository.ts#InitialPetitionsRepository.createClosingRun':
    'post_check: execucao dispatched do dono no card dela (requireRun -> requireVisibleCard); grava no card da execucao',
  'modules/kanban/initial-petitions/initial-petitions.repository.ts#InitialPetitionsRepository.latestForCard':
    'post_check: card visivel (InitialPetitionsService.latestForCard -> requireVisibleCard)',
  'modules/kanban/initial-petitions/initial-petitions.repository.ts#InitialPetitionsRepository.findDocument':
    'post_check: card visivel (download/approve -> requireVisibleCard); documento filtrado por tenant + card + id',
  'modules/kanban/initial-petitions/initial-petitions.repository.ts#InitialPetitionsRepository.approve':
    'post_check: card visivel e scope flow:petition:approve|flow:admin no controller; so rascunho de peticao do card',
  // Fecho pelo Flow e versao corrigida (S7 e S8).
  'modules/kanban/initial-petitions/initial-petitions.repository.ts#InitialPetitionsRepository.insertCorrected':
    'post_check: card visivel (uploadCorrected -> requireVisibleCard) e scope flow:petition:approve|flow:admin no controller; tenant + card + documento',
  // Tempo real (R1): so ids dos cards do cliente; o gateway confere card e coluna por socket antes de emitir.
  'modules/kanban/customers/card-customers.repository.ts#CardCustomersRepository.cardIdsByCustomer':
    'post_check: KanbanGateway.relayCard -> requireVisibleCard + ACL de coluna por socket; nada sai sem a checagem',
  'modules/kanban/lawyers/user-lawyers.repository.ts#UserLawyersRepository.signerForCard':
    'worker: pre-condicoes da peticao (disparo sem token, ou conector depois de requireVisibleCard); devolve so quem assina o card da execucao'
};

const CARD_TABLES =
  /\b(kanban_cards|kanban_card_activities|kanban_card_attachments|kanban_card_documents|kanban_card_customers|kanban_card_assignees|kanban_card_tag_links|kanban_card_leads|kanban_lead_submissions|kanban_lead_cases|kanban_card_generated_documents)\b/;
const SQL_VERB = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN)\b/i;

const SRC = join(__dirname, '..', '..', '..');

function listSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'test' && entry !== 'node_modules') {
        files.push(...listSources(path));
      }
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(path);
    }
  }
  return files;
}

function nameOf(node: ts.Node): string | null {
  if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
    const owner = node.parent && ts.isClassDeclaration(node.parent) && node.parent.name ? `${node.parent.name.text}.` : '';
    return `${owner}${node.name.getText()}`;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ts.isSourceFile(node.parent.parent.parent)) {
    return node.name.text;
  }
  return null;
}

interface SqlSite {
  key: string;
  scoped: boolean;
}

/**
 * Funcoes do arquivo que aplicam o escopo, direta ou transitivamente (ex.: o
 * helper `baseWhere` das metricas e o metodo `base` que o chama).
 */
function scopeHelpers(source: ts.SourceFile): string[] {
  const bodies = new Map<string, string>();
  const collect = (node: ts.Node) => {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      bodies.set(node.name.getText(source), node.getText(source));
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const helpers = new Set([...bodies].filter(([, body]) => /\bvisibleCardScope\(/.test(body)).map(([name]) => name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, body] of bodies) {
      if (!helpers.has(name) && [...helpers].some((helper) => new RegExp(`\\b${helper}\\(`).test(body))) {
        helpers.add(name);
        grew = true;
      }
    }
  }
  return [...helpers];
}

function isScoped(text: string, helpers: string[]): boolean {
  return /\bvisibleCardScope\(/.test(text) || helpers.some((helper) => new RegExp(`\\b${helper}\\(`).test(text));
}

function collectSqlSites(): SqlSite[] {
  const sites = new Map<string, SqlSite>();
  for (const file of listSources(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!CARD_TABLES.test(text)) {
      continue;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    const helpers = scopeHelpers(source);
    const visit = (node: ts.Node) => {
      if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isStringLiteral(node)) {
        const literal = node.getText(source);
        if (CARD_TABLES.test(literal) && SQL_VERB.test(literal)) {
          let owner: ts.Node | undefined = node.parent;
          let name: string | null = null;
          while (owner && !name) {
            name = nameOf(owner);
            if (!name) {
              owner = owner.parent;
            }
          }
          const key = `${relative(SRC, file).split('\\').join('/')}#${name ?? '<module>'}`;
          const scoped = owner ? isScoped(owner.getText(source), helpers) : false;
          const previous = sites.get(key);
          sites.set(key, { key, scoped: previous ? previous.scoped && scoped : scoped });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...sites.values()];
}

void test('SQL sobre kanban_cards e tabelas filhas: escopo unico ou allowlist comentada', () => {
  const sites = collectSqlSites();
  assert.ok(sites.length > 30, 'o scanner precisa encontrar o SQL do modulo');
  const offenders = sites.filter((site) => !site.scoped && !ALLOWLIST[site.key]).map((site) => site.key);
  assert.deepEqual(offenders, [], 'SQL de card fora do visibleCardScope e fora da allowlist');
});

void test('allowlist sem entrada obsoleta nem entrada redundante com o escopo', () => {
  const sites = new Map(collectSqlSites().map((site) => [site.key, site]));
  const stale = Object.keys(ALLOWLIST).filter((key) => !sites.has(key));
  assert.deepEqual(stale, [], 'entrada da allowlist sem SQL correspondente');
  const redundant = Object.keys(ALLOWLIST).filter((key) => sites.get(key)?.scoped);
  assert.deepEqual(redundant, [], 'funcao ja escopada nao deve estar na allowlist');
  for (const [key, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(reason.trim().length >= 10, `${key}: motivo obrigatorio`);
  }
});

void test('leituras de conjunto conhecidas usam o escopo unico', () => {
  const scoped = new Set(collectSqlSites().filter((site) => site.scoped).map((site) => site.key));
  for (const key of [
    'modules/kanban/cards/cards.repository.ts#CardsRepository.list',
    'modules/kanban/cards/cards.repository.ts#CardsRepository.listSummaries',
    'modules/kanban/tags/tags.repository.ts#TagsRepository.listTagIdsForBoard',
    'modules/kanban/documents/card-documents.repository.ts#CardDocumentsRepository.completenessForBoard',
    'modules/kanban/customers/card-customers.repository.ts#CardCustomersRepository.filterVisibleCustomerIds',
    'modules/kanban/metrics/metrics.repository.ts#MetricsRepository.getTotalCards',
    'modules/kanban/metrics/metrics.repository.ts#MetricsRepository.getByColumn',
    'modules/kanban/metrics/metrics.repository.ts#MetricsRepository.getCardsForLeadTime',
    'modules/kanban/leads/leads.repository.ts#LeadsRepository.statusByCardForBoard',
    'modules/kanban/leads/leads.repository.ts#LeadsRepository.listQueue'
  ]) {
    assert.ok(scoped.has(key), `${key} deve usar visibleCardScope`);
  }
});
