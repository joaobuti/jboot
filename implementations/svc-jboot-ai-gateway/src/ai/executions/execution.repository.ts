import { HttpException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { AiResponseMode } from "../../config/app-config.service";

export type ExecutionView = {
  id: string;
  status: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  executionMode: string;
  /** Rotina: link da sessao Claude Code (privada do dono da rotina). */
  externalSessionUrl: string | null;
};
type ExecutionRow = {
  id: string;
  status: string;
  agent_id: string;
  agent_version: number;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: string | null;
  latency_ms: number | null;
  error_code: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  input_sha256: string;
  tool_calls_ciphertext: Buffer | null;
  tool_calls_nonce: Buffer | null;
  tool_calls_auth_tag: Buffer | null;
  tool_calls_key_version: number | null;
  execution_mode: string;
  external_session_url: string | null;
};
/** Agent em modo rotina: so o necessario para o disparo. */
export type RoutineMaterial = {
  agentId: string;
  agentVersion: number;
  fireUrl: string;
  tokenCiphertext: Buffer;
  tokenNonce: Buffer;
  tokenAuthTag: Buffer;
  tokenKeyVersion: number;
};
export type ExecutionMaterial = {
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  credentialId: string;
  credentialCiphertext: Buffer;
  credentialNonce: Buffer;
  credentialAuthTag: Buffer;
  credentialKeyVersion: number;
  promptCiphertext: Buffer;
  promptNonce: Buffer;
  promptAuthTag: Buffer;
  promptKeyVersion: number;
  outputSchema: Record<string, unknown>;
  responseMode: AiResponseMode;
  allowedTools: string[];
  toolPolicyVersion: string;
};
type MaterialRow = {
  agent_id: string;
  active_version: number;
  provider: string;
  model: string;
  credential_id: string;
  credential_ciphertext: Buffer;
  credential_nonce: Buffer;
  credential_auth_tag: Buffer;
  credential_key_version: number;
  prompt_ciphertext: Buffer;
  prompt_nonce: Buffer;
  prompt_auth_tag: Buffer;
  prompt_key_version: number;
  output_schema_json: Record<string, unknown>;
  response_mode: AiResponseMode;
  allowed_tools_json: string[];
  tool_policy_version: string;
};
const view = (r: ExecutionRow): ExecutionView => ({
  id: r.id,
  status: r.status,
  agentId: r.agent_id,
  agentVersion: r.agent_version,
  provider: r.provider,
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  estimatedCost: r.estimated_cost,
  latencyMs: r.latency_ms,
  errorCode: r.error_code,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  executionMode: r.execution_mode ?? 'api',
  externalSessionUrl: r.external_session_url ?? null,
});

@Injectable()
export class ExecutionRepository {
  constructor(private readonly db: DatabaseService) {}
  async material(
    clientId: string,
    ownerId: string,
    applicationSlug: string,
    agentId: string,
  ) {
    const row = (
      await this.db.query<MaterialRow>(
        `SELECT a.id agent_id,a.active_version,a.provider,a.model,a.credential_id,c.ciphertext credential_ciphertext,c.nonce credential_nonce,c.auth_tag credential_auth_tag,c.encryption_key_version credential_key_version,v.system_prompt_ciphertext prompt_ciphertext,v.nonce prompt_nonce,v.auth_tag prompt_auth_tag,v.encryption_key_version prompt_key_version,v.response_mode,v.output_schema_json,v.allowed_tools_json,v.tool_policy_version FROM ai_agents a JOIN ai_credentials c ON c.id=a.credential_id AND c.client_id=a.client_id AND c.owner_identity_id=a.owner_identity_id JOIN ai_agent_versions v ON v.agent_id=a.id AND v.version=a.active_version WHERE a.id=$1 AND a.client_id=$2 AND a.owner_identity_id=$3 AND a.application_slug=$4 AND a.status='active' AND c.status='active' AND a.execution_mode='api'`,
        [agentId, clientId, ownerId, applicationSlug],
      )
    ).rows[0];
    if (!row) return null;
    return {
      agentId: row.agent_id,
      agentVersion: row.active_version,
      provider: row.provider,
      model: row.model,
      credentialId: row.credential_id,
      credentialCiphertext: row.credential_ciphertext,
      credentialNonce: row.credential_nonce,
      credentialAuthTag: row.credential_auth_tag,
      credentialKeyVersion: row.credential_key_version,
      promptCiphertext: row.prompt_ciphertext,
      promptNonce: row.prompt_nonce,
      promptAuthTag: row.prompt_auth_tag,
      promptKeyVersion: row.prompt_key_version,
      responseMode: row.response_mode,
      outputSchema: row.output_schema_json,
      allowedTools: row.allowed_tools_json,
      toolPolicyVersion: row.tool_policy_version,
    };
  }
  /** Modo do agent ativo do dono no tenant/modulo (null = inexistente/inativo). */
  async mode(clientId: string, ownerId: string, applicationSlug: string, agentId: string): Promise<string | null> {
    const row = (
      await this.db.query<{ execution_mode: string }>(
        "SELECT execution_mode FROM ai_agents WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND application_slug=$4 AND status='active'",
        [agentId, clientId, ownerId, applicationSlug],
      )
    ).rows[0];
    return row?.execution_mode ?? null;
  }
  async routineMaterial(clientId: string, ownerId: string, applicationSlug: string, agentId: string): Promise<RoutineMaterial | null> {
    const row = (
      await this.db.query<{ id: string; active_version: number; routine_fire_url: string; routine_token_ciphertext: Buffer; routine_token_nonce: Buffer; routine_token_auth_tag: Buffer; routine_token_key_version: number }>(
        `SELECT id,active_version,routine_fire_url,routine_token_ciphertext,routine_token_nonce,routine_token_auth_tag,routine_token_key_version
           FROM ai_agents WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND application_slug=$4 AND status='active' AND execution_mode='claude_routine'`,
        [agentId, clientId, ownerId, applicationSlug],
      )
    ).rows[0];
    return row ? {
      agentId: row.id,
      agentVersion: row.active_version,
      fireUrl: row.routine_fire_url,
      tokenCiphertext: row.routine_token_ciphertext,
      tokenNonce: row.routine_token_nonce,
      tokenAuthTag: row.routine_token_auth_tag,
      tokenKeyVersion: row.routine_token_key_version,
    } : null;
  }
  async byKey(clientId: string, applicationSlug: string, key: string) {
    const r = (
      await this.db.query<ExecutionRow>(
        "SELECT * FROM ai_executions WHERE client_id=$1 AND application_slug=$2 AND idempotency_key=$3",
        [clientId, applicationSlug, key],
      )
    ).rows[0];
    return r
      ? {
          view: view(r),
          inputSha256: r.input_sha256,
          toolCallsEnvelope:
            r.tool_calls_ciphertext && r.tool_calls_nonce && r.tool_calls_auth_tag && r.tool_calls_key_version !== null
              ? {
                  ciphertext: r.tool_calls_ciphertext,
                  nonce: r.tool_calls_nonce,
                  authTag: r.tool_calls_auth_tag,
                  keyVersion: r.tool_calls_key_version,
                }
              : null,
        }
      : null;
  }
  async create(data: {
    id: string;
    clientId: string;
    requesterId: string;
    applicationSlug: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    inputSha256: string;
    material: Pick<ExecutionMaterial, 'agentId' | 'agentVersion' | 'provider' | 'model'>;
    executionMode?: 'api' | 'claude_routine';
  }) {
    const m = data.material;
    return this.db.transaction(async client => {
    // Transaction-scoped per-owner reservation prevents parallel requests from
    // exceeding conservative rollout limits across API replicas.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ai-execution:${data.clientId}:${data.requesterId}`]);
    const existing = await client.query<ExecutionRow>('SELECT * FROM ai_executions WHERE client_id=$1 AND application_slug=$2 AND idempotency_key=$3', [data.clientId, data.applicationSlug, data.idempotencyKey]);
    if (existing.rows.length) return null;
    const usage = await client.query<{ daily: string; running: string }>("SELECT COUNT(*)::text AS daily,COUNT(*) FILTER (WHERE status='running')::text AS running FROM ai_executions WHERE client_id=$1 AND requester_identity_id=$2 AND created_at > NOW()-INTERVAL '24 hours'", [data.clientId, data.requesterId]);
    if (Number(usage.rows[0].daily) >= 20 || Number(usage.rows[0].running) >= 2) throw new HttpException('ai_execution_quota_exceeded', 429);
    const r = (
      await client.query<ExecutionRow>(
        `INSERT INTO ai_executions(id,client_id,requester_identity_id,agent_id,agent_version,application_slug,source_type,source_id,idempotency_key,provider,model,status,input_sha256,started_at,execution_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'running',$12,NOW(),$13) ON CONFLICT(client_id,application_slug,idempotency_key) DO NOTHING RETURNING *`,
        [
          data.id,
          data.clientId,
          data.requesterId,
          m.agentId,
          m.agentVersion,
          data.applicationSlug,
          data.sourceType,
          data.sourceId,
          data.idempotencyKey,
          m.provider,
          m.model,
          data.inputSha256,
          data.executionMode ?? 'api',
        ],
      )
    ).rows[0];
    return r ? view(r) : null;
    });
  }
  async succeed(
    id: string,
    outputSha256: string,
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
    toolCallsEnvelope?: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number },
  ) {
    const r = (
      await this.db.query<ExecutionRow>(
        "UPDATE ai_executions SET status='succeeded',output_sha256=$2,latency_ms=$3,input_tokens=$4,output_tokens=$5,tool_calls_ciphertext=$6,tool_calls_nonce=$7,tool_calls_auth_tag=$8,tool_calls_key_version=$9,estimated_cost=NULL,finished_at=NOW() WHERE id=$1 AND status='running' RETURNING *",
        [
          id,
          outputSha256,
          latencyMs,
          inputTokens,
          outputTokens,
          toolCallsEnvelope?.ciphertext ?? null,
          toolCallsEnvelope?.nonce ?? null,
          toolCallsEnvelope?.authTag ?? null,
          toolCallsEnvelope?.keyVersion ?? null,
        ],
      )
    ).rows[0];
    return view(r);
  }
  async dispatched(id: string, sessionUrl: string, latencyMs: number) {
    const r = (
      await this.db.query<ExecutionRow>(
        "UPDATE ai_executions SET status='dispatched',external_session_url=$2,latency_ms=$3,finished_at=NOW() WHERE id=$1 AND status='running' RETURNING *",
        [id, sessionUrl, latencyMs],
      )
    ).rows[0];
    return view(r);
  }
  async fail(id: string, errorCode: string, latencyMs: number) {
    const r = (
      await this.db.query<ExecutionRow>(
        "UPDATE ai_executions SET status='failed',error_code=$2,latency_ms=$3,finished_at=NOW() WHERE id=$1 RETURNING *",
        [id, errorCode, latencyMs],
      )
    ).rows[0];
    return view(r);
  }
  async find(id: string, clientId: string, applicationSlug: string) {
    const r = (
      await this.db.query<ExecutionRow>(
        "SELECT * FROM ai_executions WHERE id=$1 AND client_id=$2 AND application_slug=$3",
        [id, clientId, applicationSlug],
      )
    ).rows[0];
    return r ? view(r) : null;
  }
}
