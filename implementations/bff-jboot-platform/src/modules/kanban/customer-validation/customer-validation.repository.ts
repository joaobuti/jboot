import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CustomerAddressFillInput } from '../../establishment-customers/customer-address.types';
import { CustomerJuridicoFillInput } from '../../establishment-customers/customer-juridico.types';
import { CustomerDocumentType } from '../customer-documents/customer-document-catalog';
import { KitGender, KitWaiverCourt } from './kit-tag-values';

export type ValidationRunStatus = 'dispatching' | 'dispatched' | 'answered' | 'failed' | 'expired';
export type ValidationVerdict = 'aprovado' | 'pendencias';

export interface ValidationSnapshotItem {
  type: CustomerDocumentType;
  documentId: string;
  version: number;
}

export interface ValidationFinding {
  documentType: CustomerDocumentType;
  status: 'ok' | 'pendente' | 'ilegivel' | 'divergente';
  note: string;
}

/** Revisao humana dos valores do kit (ADR 019): substitui os valores da IA na geracao. */
export interface KitReview {
  values: Record<string, string>;
  gender: KitGender | null;
  waiverCourt: KitWaiverCourt | null;
}

export type IntakeResult = 'created' | 'existing' | 'no_office' | 'no_board' | 'no_backlog' | 'failed';
/** Responsaveis do card de entrada (ADR 019, decisao 16): ids atribuidos e os que ficaram de fora. */
export interface IntakeAssignees {
  assigned: string[];
  skipped: Array<{ identityId: string; reason: 'not_board_member' | 'not_in_card_office' }>;
  /** Falha ao atribuir (o card continua criado). */
  error?: 'assign_failed';
}

/** Kit do escritorio na confirmacao (Sprint 4; ADR 019, decisao 19). */
export type KitResult = 'generated' | 'not_approved' | 'no_model' | 'model_not_docx' | 'failed';

export interface OfficeKitRow {
  id: string;
  customerId: string;
  runId: string;
  officeId: string;
  contractVersion: number;
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  report: Record<string, unknown>;
}

/** Kit para a tela: arquivo, relatorio da montagem e estado do envio ao Drive (sem conteudo). */
export interface OfficeKitSummary {
  id: string;
  fileName: string;
  report: Record<string, unknown>;
  /** Estado da replica (`pending`, `syncing`, `synced`, `failed`); null = ainda nao enfileirado. */
  driveState: string | null;
  driveActive: boolean;
  createdAt: string;
}

/** Arquivo do kit no storage do Flow (download pelo card). */
export interface CustomerOfficeKitFile {
  id: string;
  /** Escritorio do modelo usado: escolhe o agente do Validador de assinatura (S2). */
  officeId: string;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
}

const KIT_FILE_COLUMNS = `id, office_id AS "officeId", file_name AS "fileName", size_bytes::integer AS "sizeBytes",
  storage_key AS "storageKey", created_at AS "createdAt"`;

/**
 * Reserva da validacao = agente do escritorio principal (flow-offices-sprints.md, S1; migration 134).
 * A configuracao geral antiga (`kanban_customer_validation_settings`) foi copiada para ele e nao e
 * mais lida.
 */
export interface ValidationSettingsRow {
  officeId: string;
  agentId: string;
  executorIdentityId: string;
  updatedAt: string;
}

export interface OfficeValidationSettingsRow {
  officeId: string;
  agentId: string;
  agentOwnerIdentityId: string;
  updatedAt: string;
}

export interface ValidationRunRow {
  id: string;
  customerId: string;
  /** Escritorio cuja conta Claude executa; null = conta principal (ADR 018). */
  officeId: string | null;
  agentId: string;
  executorIdentityId: string;
  requestedByIdentityId: string;
  status: ValidationRunStatus;
  documentsSnapshot: ValidationSnapshotItem[];
  residenceProofThirdParty: boolean;
  /** Perfil lido: CPF conferido no RG novo/CNH em vez do documento CPF. */
  cpfOnIdentity: boolean;
  verdict: ValidationVerdict | null;
  findings: ValidationFinding[] | null;
  summary: string | null;
  /** Dados lidos dos documentos pela IA, ja normalizados (S6). */
  extractedData: (CustomerJuridicoFillInput & CustomerAddressFillInput) | null;
  /** Campos da ficha que estavam vazios e receberam o valor extraido. */
  appliedFields: string[];
  /** Documentos liberados para a rotina neste pedido; null = todos (pedidos anteriores a S2). */
  readableDocumentTypes: CustomerDocumentType[] | null;
  /** Escritorio e versao do modelo do kit enviados no pedido (ADR 019); null sem modelo. */
  contractOfficeId: string | null;
  contractVersion: number | null;
  /** Valores das tags devolvidos pela IA, so com parecer aprovado. */
  tagValues: Record<string, string> | null;
  gender: KitGender | null;
  waiverCourt: KitWaiverCourt | null;
  generalFindings: string[] | null;
  alerts: string[] | null;
  review: KitReview | null;
  reviewedByIdentityId: string | null;
  reviewedAt: string | null;
  /** Escritorio do pedido: define o board de entrada do card (ADR 019, decisao 16). */
  intakeOfficeId: string | null;
  /** Resultado da criacao do card na confirmacao; null antes de confirmar. */
  intakeResult: IntakeResult | null;
  intakeBoardId: string | null;
  intakeCardId: string | null;
  intakeAssignees: IntakeAssignees | null;
  kitResult: KitResult | null;
  kitId: string | null;
  externalSessionUrl: string | null;
  errorCode: string | null;
  answeredAt: string | null;
  confirmedByIdentityId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  /** So na confirmacao: itens enfileirados para o Drive. */
  driveQueued?: number;
}

const RUN_COLUMNS = `id, customer_id AS "customerId", office_id AS "officeId", agent_id AS "agentId", executor_identity_id AS "executorIdentityId",
  requested_by_identity_id AS "requestedByIdentityId", status, documents_snapshot AS "documentsSnapshot",
  residence_proof_third_party AS "residenceProofThirdParty", cpf_on_identity AS "cpfOnIdentity", verdict, findings, summary,
  extracted_data AS "extractedData", applied_fields AS "appliedFields",
  readable_document_types AS "readableDocumentTypes", contract_office_id AS "contractOfficeId",
  contract_version AS "contractVersion", tag_values AS "tagValues", gender, waiver_court AS "waiverCourt",
  general_findings AS "generalFindings", alerts, review, reviewed_by_identity_id AS "reviewedByIdentityId",
  reviewed_at AS "reviewedAt", intake_office_id AS "intakeOfficeId", intake_result AS "intakeResult",
  intake_board_id AS "intakeBoardId", intake_card_id AS "intakeCardId", intake_assignees AS "intakeAssignees", kit_result AS "kitResult", kit_id AS "kitId",
  external_session_url AS "externalSessionUrl", error_code AS "errorCode", answered_at AS "answeredAt",
  confirmed_by_identity_id AS "confirmedByIdentityId", confirmed_at AS "confirmedAt", created_at AS "createdAt"`;

/**
 * Rotina que nao leu o pedido neste prazo nao alcancou o Flow (tunel, conector, autorizacao): o pedido
 * expira e o botao Validar libera. A rotina nao consegue avisar a falha porque o conector e o canal.
 */
export const ROUTINE_PICKUP_TIMEOUT_MINUTES = 5;
/** Rotina que leu o pedido e parou de chamar o conector libera novo pedido depois deste prazo. */
export const DISPATCHED_RUN_TIMEOUT_MINUTES = 15;

/** Expira o `dispatched` parado; `$3`/`$4` sao os prazos acima (vale para ficha e listagem). */
const EXPIRE_STALE_SET = `SET status = 'expired',
         error_code = CASE WHEN picked_up_at IS NULL THEN 'routine_not_reached' ELSE 'routine_no_answer' END,
         updated_at = clock_timestamp()`;
const EXPIRE_STALE_WHERE = `status = 'dispatched'
         AND updated_at < clock_timestamp() - make_interval(mins => CASE WHEN picked_up_at IS NULL THEN $3::int ELSE $4::int END)`;

@Injectable()
export class CustomerValidationRepository {
  constructor(private readonly db: DatabaseService) {}

  async getSettings(ref: string, clientId: string): Promise<ValidationSettingsRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationSettingsRow>(
      ref,
      `SELECT s.office_id AS "officeId", s.agent_id AS "agentId", s.agent_owner_identity_id AS "executorIdentityId",
              s.updated_at AS "updatedAt"
       FROM kanban_offices o
       JOIN kanban_customer_validation_office_settings s ON s.client_id = o.client_id AND s.office_id = o.id
       WHERE o.client_id = $1 AND o.is_principal`,
      [clientId]
    );
    return result.rows[0] ?? null;
  }

  /** Grava o agente do escritorio principal; sem principal, `null` (quem chama recusa). */
  async putSettings(ref: string, clientId: string, agentId: string, identityId: string): Promise<ValidationSettingsRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationSettingsRow>(
      ref,
      `INSERT INTO kanban_customer_validation_office_settings
         (client_id, office_id, agent_id, agent_owner_identity_id, updated_by_identity_id)
       SELECT $1, o.id, $2, $3, $3 FROM kanban_offices o WHERE o.client_id = $1 AND o.is_principal
       ON CONFLICT (client_id, office_id) DO UPDATE SET agent_id = EXCLUDED.agent_id,
         agent_owner_identity_id = EXCLUDED.agent_owner_identity_id,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = now()
       RETURNING office_id AS "officeId", agent_id AS "agentId", agent_owner_identity_id AS "executorIdentityId",
                 updated_at AS "updatedAt"`,
      [clientId, agentId, identityId]
    );
    return result.rows[0] ?? null;
  }

  async listOfficeSettings(ref: string, clientId: string): Promise<OfficeValidationSettingsRow[]> {
    const result = await this.db.queryForDatabaseRef<OfficeValidationSettingsRow>(
      ref,
      `SELECT office_id AS "officeId", agent_id AS "agentId", agent_owner_identity_id AS "agentOwnerIdentityId",
              updated_at AS "updatedAt"
       FROM kanban_customer_validation_office_settings WHERE client_id = $1`,
      [clientId]
    );
    return result.rows;
  }

  async getOfficeSettings(ref: string, clientId: string, officeId: string): Promise<OfficeValidationSettingsRow | null> {
    const result = await this.db.queryForDatabaseRef<OfficeValidationSettingsRow>(
      ref,
      `SELECT office_id AS "officeId", agent_id AS "agentId", agent_owner_identity_id AS "agentOwnerIdentityId",
              updated_at AS "updatedAt"
       FROM kanban_customer_validation_office_settings WHERE client_id = $1 AND office_id = $2`,
      [clientId, officeId]
    );
    return result.rows[0] ?? null;
  }

  /** Agente da conta Claude do escritorio; o `flow:admin` que salva e o dono do agente no gateway. */
  async putOfficeSettings(ref: string, clientId: string, officeId: string, agentId: string, identityId: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_customer_validation_office_settings
         (client_id, office_id, agent_id, agent_owner_identity_id, updated_by_identity_id)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (client_id, office_id) DO UPDATE SET agent_id = EXCLUDED.agent_id,
         agent_owner_identity_id = EXCLUDED.agent_owner_identity_id,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = clock_timestamp()`,
      [clientId, officeId, agentId, identityId]
    );
  }

  async deleteOfficeSettings(ref: string, clientId: string, officeId: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `DELETE FROM kanban_customer_validation_office_settings WHERE client_id = $1 AND office_id = $2`,
      [clientId, officeId]
    );
  }

  async isOfficeResponsible(ref: string, clientId: string, officeId: string, identityId: string): Promise<boolean> {
    const result = await this.db.queryForDatabaseRef(
      ref,
      `SELECT 1 FROM kanban_user_offices
       WHERE client_id = $1 AND office_id = $2 AND identity_id = $3 AND is_responsible`,
      [clientId, officeId, identityId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Expira runs `dispatched` parados, para nao travar o cliente (prazos acima). */
  async expireStale(ref: string, clientId: string, customerId: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs ${EXPIRE_STALE_SET}
       WHERE client_id = $1 AND customer_id = $2 AND ${EXPIRE_STALE_WHERE}`,
      [clientId, customerId, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES]
    );
  }

  /** Mesma regra de `expireStale` para uma pagina de clientes (listagem). */
  async expireStaleForCustomers(ref: string, clientId: string, customerIds: string[]): Promise<void> {
    if (customerIds.length === 0) return;
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs ${EXPIRE_STALE_SET}
       WHERE client_id = $1 AND customer_id = ANY($2::uuid[]) AND ${EXPIRE_STALE_WHERE}`,
      [clientId, customerIds, ROUTINE_PICKUP_TIMEOUT_MINUTES, DISPATCHED_RUN_TIMEOUT_MINUTES]
    );
  }

  /** Cada chamada da rotina pelo conector: marca a leitura do pedido e renova o prazo. */
  async touchByRoutine(ref: string, clientId: string, id: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs
       SET picked_up_at = COALESCE(picked_up_at, clock_timestamp()), updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatched'`,
      [clientId, id]
    );
  }

  /** null quando ja existe run em andamento para o cliente (indice unico parcial). */
  async create(
    ref: string,
    clientId: string,
    input: {
      id: string;
      customerId: string;
      officeId: string | null;
      agentId: string;
      executorIdentityId: string;
      requestedByIdentityId: string;
      snapshot: ValidationSnapshotItem[];
      residenceProofThirdParty: boolean;
      cpfOnIdentity: boolean;
      /** null = todos os documentos (sem politica da empresa). */
      readableDocumentTypes?: CustomerDocumentType[] | null;
      contract?: { officeId: string; version: number } | null;
      /** Escritorio escolhido no pedido (mesmo com a rotina da conta principal). */
      intakeOfficeId?: string | null;
    }
  ): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `INSERT INTO kanban_customer_validation_runs
         (id, client_id, customer_id, agent_id, executor_identity_id, requested_by_identity_id, status,
          documents_snapshot, residence_proof_third_party, office_id, cpf_on_identity,
          readable_document_types, contract_office_id, contract_version, intake_office_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'dispatching', $7::jsonb, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (client_id, customer_id) WHERE status IN ('dispatching', 'dispatched') DO NOTHING
       RETURNING ${RUN_COLUMNS}`,
      [
        input.id,
        clientId,
        input.customerId,
        input.agentId,
        input.executorIdentityId,
        input.requestedByIdentityId,
        JSON.stringify(input.snapshot),
        input.residenceProofThirdParty,
        input.officeId,
        input.cpfOnIdentity,
        input.readableDocumentTypes ?? null,
        input.contract?.officeId ?? null,
        input.contract?.version ?? null,
        input.intakeOfficeId ?? null
      ]
    );
    return result.rows[0] ?? null;
  }

  async markDispatched(ref: string, clientId: string, id: string, executionId: string, sessionUrl: string | null) {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs
       SET status = 'dispatched', gateway_execution_id = $3, external_session_url = $4, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatching'`,
      [clientId, id, executionId, sessionUrl]
    );
  }

  async markFailed(ref: string, clientId: string, id: string, code: string) {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs SET status = 'failed', error_code = $3, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatching'`,
      [clientId, id, code.slice(0, 80)]
    );
  }

  async findById(ref: string, clientId: string, id: string): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_customer_validation_runs WHERE client_id = $1 AND id = $2`,
      [clientId, id]
    );
    return result.rows[0] ?? null;
  }

  async listRecent(ref: string, clientId: string, customerId: string, limit = 5): Promise<ValidationRunRow[]> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_customer_validation_runs
       WHERE client_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [clientId, customerId, limit]
    );
    return result.rows;
  }

  /** Ultimos runs de uma pagina de clientes (alertas da listagem). */
  async listRecentForCustomers(ref: string, clientId: string, customerIds: string[], perCustomer = 5): Promise<ValidationRunRow[]> {
    if (customerIds.length === 0) return [];
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM (
         SELECT r.*, row_number() OVER (PARTITION BY r.customer_id ORDER BY r.created_at DESC) AS position
         FROM kanban_customer_validation_runs r
         WHERE r.client_id = $1 AND r.customer_id = ANY($2::uuid[])
       ) recent
       WHERE position <= $3
       ORDER BY created_at DESC`,
      [clientId, customerIds, perCustomer]
    );
    return result.rows;
  }

  /** Ultima validacao aprovada por uma pessoa (confirmada), base dos documentos validados. */
  async latestConfirmed(ref: string, clientId: string, customerId: string): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_customer_validation_runs
       WHERE client_id = $1 AND customer_id = $2 AND confirmed_at IS NOT NULL
       ORDER BY confirmed_at DESC LIMIT 1`,
      [clientId, customerId]
    );
    return result.rows[0] ?? null;
  }

  /** Ultimo parecer do agente (confirmado ou nao): situacao de cada documento na lista da ficha. */
  async latestAnswered(ref: string, clientId: string, customerId: string): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `SELECT ${RUN_COLUMNS} FROM kanban_customer_validation_runs
       WHERE client_id = $1 AND customer_id = $2 AND answered_at IS NOT NULL
       ORDER BY answered_at DESC LIMIT 1`,
      [clientId, customerId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Parecer do agente, so com o run `dispatched`. Run da conta principal: so a identidade
   * central que o executou. Run de escritorio: so um responsavel daquele escritorio (ADR 018).
   */
  async answer(
    ref: string,
    clientId: string,
    input: {
      id: string;
      executorIdentityId: string;
      verdict: ValidationVerdict;
      findings: ValidationFinding[];
      summary: string;
      extractedData: (CustomerJuridicoFillInput & CustomerAddressFillInput) | null;
      kit?: {
        tagValues: Record<string, string> | null;
        gender: KitGender | null;
        waiverCourt: KitWaiverCourt | null;
        generalFindings: string[];
        alerts: string[];
      };
    }
  ): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `UPDATE kanban_customer_validation_runs
       SET status = 'answered', verdict = $4, findings = $5::jsonb, summary = $6, extracted_data = $7::jsonb,
           tag_values = $8::jsonb, gender = $9, waiver_court = $10, general_findings = $11::jsonb, alerts = $12::jsonb,
           answered_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2 AND status = 'dispatched'
         AND CASE WHEN office_id IS NULL THEN executor_identity_id = $3
                  ELSE EXISTS (SELECT 1 FROM kanban_user_offices uo
                               WHERE uo.client_id = $1 AND uo.office_id = kanban_customer_validation_runs.office_id
                                 AND uo.identity_id = $3 AND uo.is_responsible)
             END
       RETURNING ${RUN_COLUMNS}`,
      [
        clientId,
        input.id,
        input.executorIdentityId,
        input.verdict,
        JSON.stringify(input.findings),
        input.summary,
        input.extractedData ? JSON.stringify(input.extractedData) : null,
        input.kit?.tagValues ? JSON.stringify(input.kit.tagValues) : null,
        input.kit?.gender ?? null,
        input.kit?.waiverCourt ?? null,
        JSON.stringify(input.kit?.generalFindings ?? []),
        JSON.stringify(input.kit?.alerts ?? [])
      ]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Revisao humana dos valores do kit: so para parecer `aprovado` deste cliente. A revisao
   * nao apaga os valores da IA (ficam para auditoria do que foi sugerido).
   */
  async saveReview(ref: string, clientId: string, customerId: string, id: string, review: KitReview, identityId: string) {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `UPDATE kanban_customer_validation_runs
       SET review = $4::jsonb, reviewed_by_identity_id = $5, reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE client_id = $1 AND customer_id = $2 AND id = $3 AND status = 'answered' AND verdict = 'aprovado'
         AND confirmed_at IS NULL
       RETURNING ${RUN_COLUMNS}`,
      [clientId, customerId, id, JSON.stringify(review), identityId]
    );
    return result.rows[0] ?? null;
  }

  /** Documentos que a rotina de validacao pode ler; null = todos (sem politica). */
  async getReadablePolicy(ref: string, clientId: string): Promise<CustomerDocumentType[] | null> {
    const result = await this.db.queryForDatabaseRef<{ types: CustomerDocumentType[] }>(
      ref,
      `SELECT readable_document_types AS types FROM kanban_customer_validation_policies WHERE client_id = $1`,
      [clientId]
    );
    return result.rows[0]?.types ?? null;
  }

  async putReadablePolicy(ref: string, clientId: string, types: CustomerDocumentType[], identityId: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_customer_validation_policies (client_id, readable_document_types, updated_by_identity_id)
       VALUES ($1, $2::text[], $3)
       ON CONFLICT (client_id) DO UPDATE SET readable_document_types = EXCLUDED.readable_document_types,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = clock_timestamp()`,
      [clientId, types, identityId]
    );
  }

  /** Board de entrada de cada escritorio (ADR 019, decisao 16). */
  async listIntakeBoards(ref: string, clientId: string): Promise<Map<string, string>> {
    const result = await this.db.queryForDatabaseRef<{ officeId: string; boardId: string }>(
      ref,
      `SELECT office_id AS "officeId", board_id AS "boardId" FROM kanban_office_intake_boards WHERE client_id = $1`,
      [clientId]
    );
    return new Map(result.rows.map((row) => [row.officeId, row.boardId]));
  }

  async putIntakeBoard(ref: string, clientId: string, officeId: string, boardId: string, identityId: string): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `INSERT INTO kanban_office_intake_boards (client_id, office_id, board_id, updated_by_identity_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, office_id) DO UPDATE SET board_id = EXCLUDED.board_id,
         updated_by_identity_id = EXCLUDED.updated_by_identity_id, updated_at = clock_timestamp()`,
      [clientId, officeId, boardId, identityId]
    );
  }

  async deleteIntakeBoard(ref: string, clientId: string, officeId: string): Promise<void> {
    await this.db.queryForDatabaseRef(ref, `DELETE FROM kanban_office_intake_boards WHERE client_id = $1 AND office_id = $2`, [clientId, officeId]);
  }

  /** Card ativo do cliente no board (nao excluido nem arquivado): evita card duplicado. */
  async findActiveCustomerCard(ref: string, clientId: string, boardId: string, customerId: string): Promise<string | null> {
    const result = await this.db.queryForDatabaseRef<{ id: string }>(
      ref,
      `SELECT c.id FROM kanban_cards c
       JOIN kanban_card_customers l ON l.client_id = c.client_id AND l.card_id = c.id
       WHERE c.client_id = $1 AND c.board_id = $2 AND l.customer_id = $3 AND c.status NOT IN ('deleted', 'archived')
       ORDER BY c.created_at LIMIT 1`,
      [clientId, boardId, customerId]
    );
    return result.rows[0]?.id ?? null;
  }

  async setIntake(
    ref: string,
    clientId: string,
    id: string,
    result: IntakeResult,
    boardId: string | null,
    cardId: string | null,
    assignees: IntakeAssignees | null = null
  ): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs
       SET intake_result = $3, intake_board_id = $4, intake_card_id = $5, intake_assignees = $6::jsonb,
           updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2`,
      [clientId, id, result, boardId, cardId, assignees ? JSON.stringify(assignees) : null]
    );
  }

  /** Responsaveis do escritorio (aba Usuarios), do vinculo mais antigo ao mais novo. */
  async listOfficeResponsibles(ref: string, clientId: string, officeId: string): Promise<string[]> {
    const result = await this.db.queryForDatabaseRef<{ identityId: string }>(
      ref,
      `SELECT identity_id AS "identityId" FROM kanban_user_offices
       WHERE client_id = $1 AND office_id = $2 AND is_responsible
       ORDER BY created_at, identity_id`,
      [clientId, officeId]
    );
    return result.rows.map((row) => row.identityId);
  }

  async setKitResult(ref: string, clientId: string, id: string, result: Exclude<KitResult, 'generated'>): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs SET kit_result = $3, kit_id = NULL, updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2`,
      [clientId, id, result]
    );
  }

  /**
   * Grava o kit gerado, marca o run e enfileira o envio ao Drive (Drive ativo) numa transacao.
   * Drive desligado: o kit fica sem fila e a reconciliacao o envia quando o Drive voltar (Q4).
   */
  async saveKit(ref: string, clientId: string, kit: OfficeKitRow, identityId: string): Promise<{ driveQueued: boolean }> {
    return this.db.transactionForDatabaseRef(ref, async (tx) => {
      await tx.query(
        `INSERT INTO kanban_customer_office_kits
           (id, client_id, customer_id, run_id, office_id, contract_version, storage_key, file_name, size_bytes, sha256, report, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
        [kit.id, clientId, kit.customerId, kit.runId, kit.officeId, kit.contractVersion, kit.storageKey, kit.fileName,
          kit.sizeBytes, kit.sha256, JSON.stringify(kit.report), identityId]
      );
      await tx.query(
        `UPDATE kanban_customer_validation_runs SET kit_result = 'generated', kit_id = $3, updated_at = clock_timestamp()
         WHERE client_id = $1 AND id = $2`,
        [clientId, kit.runId, kit.id]
      );
      const queued = await tx.query(
        `INSERT INTO kanban_document_syncs
           (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
         SELECT $1, $2, 1, $3, 'pending', now(), 'office_kit', $4
         WHERE EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = $1 AND cfg.status = 'active')
         ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING`,
        [clientId, kit.id, kit.sha256, kit.customerId]
      );
      return { driveQueued: (queued.rowCount ?? 0) > 0 };
    });
  }

  async kitSummaries(ref: string, clientId: string, kitIds: string[]): Promise<OfficeKitSummary[]> {
    if (kitIds.length === 0) return [];
    const result = await this.db.queryForDatabaseRef<OfficeKitSummary>(
      ref,
      `SELECT k.id, k.file_name AS "fileName", k.report, k.created_at AS "createdAt",
              (SELECT s.state FROM kanban_document_syncs s
               WHERE s.client_id = k.client_id AND s.document_id = k.id AND s.source_type = 'office_kit'
               ORDER BY s.created_at DESC LIMIT 1) AS "driveState",
              EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = k.client_id AND cfg.status = 'active') AS "driveActive"
       FROM kanban_customer_office_kits k
       WHERE k.client_id = $1 AND k.id = ANY($2::uuid[])`,
      [clientId, kitIds]
    );
    return result.rows;
  }

  /** Kit mais recente do cliente (um por validacao confirmada), mostrado no bloco Documentos do card. */
  async latestKitForCustomer(ref: string, clientId: string, customerId: string): Promise<CustomerOfficeKitFile | null> {
    const result = await this.db.queryForDatabaseRef<CustomerOfficeKitFile>(
      ref,
      `SELECT ${KIT_FILE_COLUMNS} FROM kanban_customer_office_kits
       WHERE client_id = $1 AND customer_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [clientId, customerId]
    );
    return result.rows[0] ?? null;
  }

  async findKitForCustomer(ref: string, clientId: string, customerId: string, kitId: string): Promise<CustomerOfficeKitFile | null> {
    const result = await this.db.queryForDatabaseRef<CustomerOfficeKitFile>(
      ref,
      `SELECT ${KIT_FILE_COLUMNS} FROM kanban_customer_office_kits
       WHERE client_id = $1 AND customer_id = $2 AND id = $3`,
      [clientId, customerId, kitId]
    );
    return result.rows[0] ?? null;
  }

  async setAppliedFields(ref: string, clientId: string, id: string, fields: string[]): Promise<void> {
    await this.db.queryForDatabaseRef(
      ref,
      `UPDATE kanban_customer_validation_runs SET applied_fields = $3::text[], updated_at = clock_timestamp()
       WHERE client_id = $1 AND id = $2`,
      [clientId, id, fields]
    );
  }

  /**
   * Confirmacao humana e, no mesmo comando, intencao de replica Drive (S3) para as
   * versoes validadas quando o Drive da empresa esta ativo. A varredura (2 min)
   * envia; Drive ligado depois e coberto pela reconciliacao.
   */
  async confirm(ref: string, clientId: string, customerId: string, id: string, identityId: string): Promise<ValidationRunRow | null> {
    const result = await this.db.queryForDatabaseRef<ValidationRunRow>(
      ref,
      `WITH confirmed AS (
         UPDATE kanban_customer_validation_runs
         SET confirmed_by_identity_id = $4, confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE client_id = $1 AND customer_id = $2 AND id = $3 AND status = 'answered' AND confirmed_at IS NULL
         RETURNING *
       ), queued AS (
         INSERT INTO kanban_document_syncs
           (client_id, document_id, document_version, checksum, state, next_attempt_at, source_type, customer_id)
         SELECT cd.client_id, cd.id, cd.version, cd.sha256, 'pending', now(), 'customer_document', cd.customer_id
         FROM confirmed c
         CROSS JOIN LATERAL jsonb_array_elements(c.documents_snapshot) item
         JOIN kanban_customer_documents cd ON cd.client_id = c.client_id AND cd.id = (item->>'documentId')::uuid
         WHERE EXISTS (SELECT 1 FROM kanban_drive_configurations cfg WHERE cfg.client_id = c.client_id AND cfg.status = 'active')
         ON CONFLICT (client_id, document_id, document_version, checksum, provider) DO NOTHING
         RETURNING id
       )
       SELECT ${RUN_COLUMNS}, (SELECT count(*)::integer FROM queued) AS "driveQueued" FROM confirmed`,
      [clientId, customerId, id, identityId]
    );
    return result.rows[0] ?? null;
  }
}
