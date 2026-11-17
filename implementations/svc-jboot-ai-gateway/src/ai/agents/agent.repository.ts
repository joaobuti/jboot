import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService } from "../../database/database.service";
import { AiResponseMode } from "../../config/app-config.service";

type AgentRow = {
  id: string;
  client_id: string;
  owner_identity_id: string;
  application_slug: string;
  credential_id: string | null;
  provider: string;
  name: string;
  description: string | null;
  model: string | null;
  execution_mode: 'api' | 'claude_routine';
  routine_fire_url: string | null;
  routine_token_last4: string | null;
  external_reference: string | null;
  active_version: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  response_mode: AiResponseMode;
  output_schema_json: Record<string, unknown>;
  allowed_tools_json: string[];
  tool_policy_version: string;
};
export type AgentView = {
  id: string;
  applicationSlug: string;
  /** `api`: chave BYOK executada aqui. `claude_routine`: rotina do Claude Code do dono. */
  executionMode: 'api' | 'claude_routine';
  credentialId: string | null;
  provider: string;
  name: string;
  description: string | null;
  model: string | null;
  /** Rotina: identifica a rotina; inutil sem o token. */
  routineFireUrl: string | null;
  /** Rotina: o token nunca volta, so os 4 ultimos caracteres. */
  routineTokenLast4: string | null;
  externalReference: string | null;
  activeVersion: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  responseMode: AiResponseMode;
  outputSchema: Record<string, unknown>;
  allowedTools: string[];
  toolPolicyVersion: string;
};
const view = (r: AgentRow): AgentView => ({
  id: r.id,
  applicationSlug: r.application_slug,
  executionMode: r.execution_mode ?? 'api',
  credentialId: r.credential_id,
  provider: r.provider,
  name: r.name,
  description: r.description,
  model: r.model,
  routineFireUrl: r.routine_fire_url ?? null,
  routineTokenLast4: r.routine_token_last4 ?? null,
  externalReference: r.external_reference,
  activeVersion: r.active_version,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  responseMode: r.response_mode,
  outputSchema: r.output_schema_json,
  allowedTools: r.allowed_tools_json,
  toolPolicyVersion: r.tool_policy_version,
});

const versionDigest = (input: {
  systemPrompt: string;
  responseMode: AiResponseMode;
  outputSchema: Record<string, unknown>;
  allowedTools: string[];
  toolPolicyVersion: string;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        systemPrompt: input.systemPrompt,
        responseMode: input.responseMode,
        outputSchema: input.outputSchema,
        allowedTools: input.allowedTools,
        toolPolicyVersion: input.toolPolicyVersion,
      }),
    )
    .digest("hex");

/** Rotina nao recebe tools do JBoot: escreve no card pelo conector MCP. */
const ROUTINE_TOOL_POLICY = 'claude_routine.v1';

@Injectable()
export class AgentRepository {
  constructor(private readonly db: DatabaseService) {}
  async list(c: string, o: string, a: string) {
    return (
      await this.db.query<AgentRow>(
        "SELECT a.*,v.response_mode,v.output_schema_json,v.allowed_tools_json,v.tool_policy_version FROM ai_agents a JOIN ai_agent_versions v ON v.agent_id=a.id AND v.version=a.active_version WHERE a.client_id=$1 AND a.owner_identity_id=$2 AND a.application_slug=$3 AND a.status<>'deleted' ORDER BY a.name LIMIT 100",
        [c, o, a],
      )
    ).rows.map(view);
  }
  async find(id: string, c: string, o: string, a: string) {
    const row = (
      await this.db.query<AgentRow>(
        "SELECT a.*,v.response_mode,v.output_schema_json,v.allowed_tools_json,v.tool_policy_version FROM ai_agents a JOIN ai_agent_versions v ON v.agent_id=a.id AND v.version=a.active_version WHERE a.id=$1 AND a.client_id=$2 AND a.owner_identity_id=$3 AND a.application_slug=$4",
        [id, c, o, a],
      )
    ).rows[0];
    return row ? view(row) : null;
  }
  async create(
    id: string,
    c: string,
    o: string,
    a: string,
    input: {
      credentialId: string;
      name: string;
      description?: string;
      model: string;
      systemPrompt: string;
      responseMode: AiResponseMode;
      outputSchema: Record<string, unknown>;
      allowedTools: string[];
      toolPolicyVersion: string;
      externalReference?: string;
    },
    provider: string,
    data: {
      ciphertext: Buffer;
      nonce: Buffer;
      authTag: Buffer;
      keyVersion: number;
    },
  ) {
    return this.db.transaction(async (q) => {
      const agent = (
        await q.query<AgentRow>(
          `INSERT INTO ai_agents(id,client_id,owner_identity_id,application_slug,credential_id,provider,name,description,model,external_reference,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') RETURNING *`,
          [
            id,
            c,
            o,
            a,
            input.credentialId,
            provider,
            input.name,
            input.description ?? null,
            input.model,
            input.externalReference ?? null,
          ],
        )
      ).rows[0];
      await q.query(
        "INSERT INTO ai_agent_versions(agent_id,version,system_prompt_ciphertext,nonce,auth_tag,encryption_key_version,response_mode,output_schema_json,allowed_tools_json,tool_policy_version,content_sha256,created_by_identity_id) VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          id,
          data.ciphertext,
          data.nonce,
          data.authTag,
          data.keyVersion,
          input.responseMode,
          JSON.stringify(input.outputSchema),
          JSON.stringify(input.allowedTools),
          input.toolPolicyVersion,
          versionDigest(input),
          o,
        ],
      );
      return view({
        ...agent,
        response_mode: input.responseMode,
        output_schema_json: input.outputSchema,
        allowed_tools_json: input.allowedTools,
        tool_policy_version: input.toolPolicyVersion,
      });
    });
  }
  /**
   * Agent em modo rotina: sem credencial nem modelo; token da rotina cifrado.
   * A versao guarda so a copia de referencia do prompt (nunca executada aqui).
   */
  async createRoutine(
    id: string,
    c: string,
    o: string,
    a: string,
    input: { name: string; description?: string; externalReference?: string; routineFireUrl: string; referencePrompt: string },
    token: { envelope: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number }; last4: string },
    prompt: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number },
  ) {
    return this.db.transaction(async (q) => {
      const agent = (
        await q.query<AgentRow>(
          `INSERT INTO ai_agents(id,client_id,owner_identity_id,application_slug,credential_id,provider,name,description,model,external_reference,status,
             execution_mode,routine_fire_url,routine_token_ciphertext,routine_token_nonce,routine_token_auth_tag,routine_token_key_version,routine_token_last4)
           VALUES($1,$2,$3,$4,NULL,'claude_routine',$5,$6,NULL,$7,'active','claude_routine',$8,$9,$10,$11,$12,$13) RETURNING *`,
          [id, c, o, a, input.name, input.description ?? null, input.externalReference ?? null, input.routineFireUrl,
            token.envelope.ciphertext, token.envelope.nonce, token.envelope.authTag, token.envelope.keyVersion, token.last4],
        )
      ).rows[0];
      await this.insertRoutineVersion(q, id, 1, input.referencePrompt, prompt, o);
      return view({ ...agent, response_mode: 'text', output_schema_json: {}, allowed_tools_json: [], tool_policy_version: ROUTINE_TOOL_POLICY });
    });
  }
  async updateRoutine(
    agent: AgentView,
    c: string,
    o: string,
    a: string,
    input: { name?: string; description?: string; externalReference?: string; routineFireUrl?: string; referencePrompt?: string },
    token?: { envelope: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number }; last4: string },
    prompt?: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number },
  ) {
    return this.db.transaction(async (q) => {
      const version = prompt ? agent.activeVersion + 1 : agent.activeVersion;
      const row = (
        await q.query<AgentRow>(
          `UPDATE ai_agents SET name=$5,description=$6,external_reference=$7,routine_fire_url=$8,active_version=$9,
             routine_token_ciphertext=COALESCE($10,routine_token_ciphertext),routine_token_nonce=COALESCE($11,routine_token_nonce),
             routine_token_auth_tag=COALESCE($12,routine_token_auth_tag),routine_token_key_version=COALESCE($13,routine_token_key_version),
             routine_token_last4=COALESCE($14,routine_token_last4),updated_at=NOW()
           WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND application_slug=$4 AND execution_mode='claude_routine' RETURNING *`,
          [agent.id, c, o, a, input.name ?? agent.name, input.description ?? agent.description,
            input.externalReference ?? agent.externalReference, input.routineFireUrl ?? agent.routineFireUrl, version,
            token?.envelope.ciphertext ?? null, token?.envelope.nonce ?? null, token?.envelope.authTag ?? null,
            token?.envelope.keyVersion ?? null, token?.last4 ?? null],
        )
      ).rows[0];
      if (prompt) await this.insertRoutineVersion(q, agent.id, version, input.referencePrompt ?? '', prompt, o);
      return view({ ...row, response_mode: 'text', output_schema_json: {}, allowed_tools_json: [], tool_policy_version: ROUTINE_TOOL_POLICY });
    });
  }
  private async insertRoutineVersion(
    q: { query: (text: string, values?: unknown[]) => Promise<unknown> },
    agentId: string,
    version: number,
    referencePrompt: string,
    prompt: { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; keyVersion: number },
    ownerId: string,
  ) {
    await q.query(
      "INSERT INTO ai_agent_versions(agent_id,version,system_prompt_ciphertext,nonce,auth_tag,encryption_key_version,response_mode,output_schema_json,allowed_tools_json,tool_policy_version,content_sha256,created_by_identity_id) VALUES($1,$2,$3,$4,$5,$6,'text','{}','[]',$7,$8,$9)",
      [agentId, version, prompt.ciphertext, prompt.nonce, prompt.authTag, prompt.keyVersion, ROUTINE_TOOL_POLICY,
        versionDigest({ systemPrompt: referencePrompt, responseMode: 'text', outputSchema: {}, allowedTools: [], toolPolicyVersion: ROUTINE_TOOL_POLICY }), ownerId],
    );
  }
  async credential(id: string, c: string, o: string) {
    return (
      (
        await this.db.query<{ provider: string; status: string }>(
          "SELECT provider,status FROM ai_credentials WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3",
          [id, c, o],
        )
      ).rows[0] ?? null
    );
  }
  async update(
    agent: AgentView,
    c: string,
    o: string,
    a: string,
    input: {
      credentialId?: string;
      name?: string;
      description?: string;
      model?: string;
      systemPrompt?: string;
      responseMode?: AiResponseMode;
      outputSchema?: Record<string, unknown>;
      allowedTools?: string[];
      toolPolicyVersion?: string;
      externalReference?: string;
    },
    provider: string,
    data?: {
      ciphertext: Buffer;
      nonce: Buffer;
      authTag: Buffer;
      keyVersion: number;
    },
  ) {
    return this.db.transaction(async (q) => {
      const version = data ? agent.activeVersion + 1 : agent.activeVersion;
      const row = (
        await q.query<AgentRow>(
          `UPDATE ai_agents SET credential_id=$5,provider=$6,name=$7,description=$8,model=$9,external_reference=$10,active_version=$11,updated_at=NOW() WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND application_slug=$4 RETURNING *`,
          [
            agent.id,
            c,
            o,
            a,
            input.credentialId ?? agent.credentialId,
            provider,
            input.name ?? agent.name,
            input.description ?? agent.description,
            input.model ?? agent.model,
            input.externalReference ?? agent.externalReference,
            version,
          ],
        )
      ).rows[0];
      if (data) {
        await q.query(
          "INSERT INTO ai_agent_versions(agent_id,version,system_prompt_ciphertext,nonce,auth_tag,encryption_key_version,response_mode,output_schema_json,allowed_tools_json,tool_policy_version,content_sha256,created_by_identity_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            agent.id,
            version,
            data.ciphertext,
            data.nonce,
            data.authTag,
            data.keyVersion,
            input.responseMode ?? agent.responseMode,
            JSON.stringify(input.outputSchema ?? {}),
            JSON.stringify(input.allowedTools ?? agent.allowedTools),
            input.toolPolicyVersion ?? agent.toolPolicyVersion,
            versionDigest({
              systemPrompt: input.systemPrompt ?? "",
              responseMode: input.responseMode ?? agent.responseMode,
              outputSchema: input.outputSchema ?? {},
              allowedTools: input.allowedTools ?? agent.allowedTools,
              toolPolicyVersion: input.toolPolicyVersion ?? agent.toolPolicyVersion,
            }),
            o,
          ],
        );
      }
      return view({
        ...row,
        response_mode: data
          ? (input.responseMode ?? agent.responseMode)
          : agent.responseMode,
        output_schema_json: data
          ? (input.outputSchema ?? agent.outputSchema)
          : agent.outputSchema,
        allowed_tools_json: data
          ? (input.allowedTools ?? agent.allowedTools)
          : agent.allowedTools,
        tool_policy_version: data
          ? (input.toolPolicyVersion ?? agent.toolPolicyVersion)
          : agent.toolPolicyVersion,
      });
    });
  }
  async remove(id: string, c: string, o: string, a: string) {
    const row = (
      await this.db.query<AgentRow>(
        "WITH updated AS (UPDATE ai_agents SET status='inactive',updated_at=NOW() WHERE id=$1 AND client_id=$2 AND owner_identity_id=$3 AND application_slug=$4 RETURNING *) SELECT updated.*,v.response_mode,v.output_schema_json,v.allowed_tools_json,v.tool_policy_version FROM updated JOIN ai_agent_versions v ON v.agent_id=updated.id AND v.version=updated.active_version",
        [id, c, o, a],
      )
    ).rows[0];
    return row ? view(row) : null;
  }
}
