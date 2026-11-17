import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AppConfigService } from "../../config/app-config.service";
import { DatabaseService } from "../../database/database.service";
import { AgentPromptCryptoService } from "../crypto/agent-prompt-crypto.service";
import { AgentRepository } from "./agent.repository";
import { AgentService } from "./agent.service";
import { CredentialService } from '../credentials/credential.service';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { ToolCatalog } from '../tools/tool-catalog';
/* eslint-disable @typescript-eslint/no-floating-promises */
const auth = {
  clientId: "33333333-3333-4333-8333-333333333333",
  identityId: "44444444-4444-4444-8444-444444444444",
  applicationSlug: "flow",
  scopes: ["ai:credentials:manage"],
  roles: ["manager"],
};
const db = new DatabaseService(new AppConfigService());
const repo = new AgentRepository(db);
const service = new AgentService(
  repo,
  new AgentPromptCryptoService(new AppConfigService()),
  // This suite covers PostgreSQL persistence, not the external HTTP contract.
  { models: async () => [{ id: 'unit-model', label: 'Unit model', capabilities: ['text-output', 'structured-output'] }] } as unknown as CredentialService,
  new ToolCatalog(),
  new CredentialCryptoService(new AppConfigService()),
);
let credentialId = "";
before(async () => {
  await db.query(
    "DELETE FROM ai_agent_versions WHERE agent_id IN (SELECT id FROM ai_agents WHERE client_id=$1)",
    [auth.clientId],
  );
  await db.query("DELETE FROM ai_agents WHERE client_id=$1", [auth.clientId]);
  const c = await db.query<{ id: string }>(
    "INSERT INTO ai_credentials(client_id,owner_identity_id,provider,ciphertext,nonce,auth_tag,encryption_key_version,last4,status) VALUES($1,$2,'anthropic',$3,$4,$5,1,'test','active') ON CONFLICT(client_id,owner_identity_id,provider) DO UPDATE SET status='active',ciphertext=$3,nonce=$4,auth_tag=$5 RETURNING id",
    [
      auth.clientId,
      auth.identityId,
      Buffer.from("x"),
      Buffer.alloc(12),
      Buffer.alloc(16),
    ],
  );
  credentialId = c.rows[0].id;
});
after(async () => {
  await db.query(
    "DELETE FROM ai_agent_versions WHERE agent_id IN (SELECT id FROM ai_agents WHERE client_id=$1)",
    [auth.clientId],
  );
  await db.query("DELETE FROM ai_agents WHERE client_id=$1", [auth.clientId]);
  await db.query("DELETE FROM ai_credentials WHERE client_id=$1", [auth.clientId]);
  await db.onModuleDestroy();
});
test("creates immutable prompt versions without exposure across modules", async () => {
  const created = await service.create(auth, {
    credentialId,
    name: "UI UX",
    model: "unit-model",
    systemPrompt: "secret system instruction",
    outputSchema: { type: "object" },
    allowedTools: [],
  });
  assert.equal(JSON.stringify(created).includes("secret system"), false);
  assert.equal(created.responseMode, 'json_schema');
  assert.deepEqual(created.allowedTools, []);
  await assert.rejects(() => service.update(auth, created.id, { model: 'unavailable-model' }), /ai_model_not_available/);
  const updated = await service.update(auth, created.id, {
    systemPrompt: "second secret instruction",
    outputSchema: { type: "object", required: ["result"] },
  });
  assert.equal(updated.activeVersion, 2);
  assert.equal(updated.responseMode, 'json_schema');
  assert.equal(
    (await service.list({ ...auth, applicationSlug: "juridico" })).length,
    0,
  );
  await assert.rejects(() =>
    service.update({ ...auth, applicationSlug: "juridico" }, created.id, {
      name: "Forbidden",
    }),
  );
  const versions = await db.query<{ system_prompt_ciphertext: Buffer }>(
    "SELECT system_prompt_ciphertext FROM ai_agent_versions WHERE agent_id=$1 ORDER BY version",
    [created.id],
  );
  assert.equal(versions.rows.length, 2);
  assert.equal(
    versions.rows.some((row) =>
      row.system_prompt_ciphertext.includes(Buffer.from("secret instruction")),
    ),
    false,
  );
  assert.equal((await service.remove(auth, created.id)).status, "inactive");
});

const ROUTINE_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01UNITROUTINE/fire";
test("routine agents store only the sealed token and keep the execution mode immutable", async () => {
  const created = await service.create(auth, {
    executionMode: "claude_routine",
    name: "Parecer via rotina",
    routineFireUrl: ROUTINE_URL,
    routineToken: "sk-ant-oat01-unitroutinetokencanary0001",
    systemPrompt: "copia de referencia do prompt",
  });
  assert.equal(created.executionMode, "claude_routine");
  assert.equal(created.credentialId, null);
  assert.equal(created.model, null);
  assert.equal(created.routineTokenLast4, "0001");
  assert.equal(JSON.stringify(created).includes("canary"), false);
  const row = await db.query<{ routine_token_ciphertext: Buffer; provider: string }>("SELECT routine_token_ciphertext,provider FROM ai_agents WHERE id=$1", [created.id]);
  assert.equal(row.rows[0].provider, "claude_routine");
  assert.equal(row.rows[0].routine_token_ciphertext.includes(Buffer.from("canary")), false);
  const listed = (await service.list(auth)).find((agent) => agent.id === created.id);
  assert.equal(JSON.stringify(listed).includes("canary"), false);
  const rotated = await service.update(auth, created.id, { routineToken: "sk-ant-oat01-unitroutinetokencanary0002" });
  assert.equal(rotated.routineTokenLast4, "0002");
  const renamed = await service.update(auth, created.id, { name: "Renomeado" });
  assert.equal(renamed.routineTokenLast4, "0002", "token mantido quando nao enviado");
  await assert.rejects(() => service.update(auth, created.id, { executionMode: "api" }), /ai_agent_execution_mode_immutable/);
  await assert.rejects(() => service.update(auth, created.id, { model: "unit-model" }), /ai_agent_routine_fields_only/);
  await assert.rejects(
    () => service.create(auth, { name: "Misto", credentialId, model: "unit-model", systemPrompt: "x", outputSchema: {}, routineFireUrl: ROUTINE_URL }),
    /ai_agent_api_fields_only/,
  );
});
test("routine reference copy accepts long prompts; the executed API prompt keeps its 50k limit", async () => {
  const long = "a".repeat(60000);
  const routine = await service.create(auth, {
    executionMode: "claude_routine",
    name: "Peticoes via rotina",
    routineFireUrl: ROUTINE_URL,
    routineToken: "sk-ant-oat01-unitroutinetokencanary0004",
    systemPrompt: long,
  });
  await service.update(auth, routine.id, { systemPrompt: `${long}b` });
  await assert.rejects(
    () => service.create(auth, { name: "Prompt longo", credentialId, model: "unit-model", systemPrompt: long, responseMode: "text" }),
    /shorter than or equal to 50000/,
  );
  const api = await service.create(auth, { name: "Prompt curto", credentialId, model: "unit-model", systemPrompt: "x", responseMode: "text" });
  await assert.rejects(() => service.update(auth, api.id, { systemPrompt: long }), /shorter than or equal to 50000/);
});
test("name of a removed agent stays reserved and returns a conflict instead of a server error", async () => {
  const routine = { executionMode: "claude_routine" as const, name: "Nome reservado", routineFireUrl: ROUTINE_URL, routineToken: "sk-ant-oat01-unitroutinetokencanary0003" };
  const created = await service.create(auth, routine);
  await service.remove(auth, created.id);
  await assert.rejects(() => service.create(auth, routine), (error: { status?: number; message?: string }) => error.status === 409 && error.message === "ai_agent_name_taken");
  await assert.rejects(
    () => service.create(auth, { name: "Nome reservado", credentialId, model: "unit-model", systemPrompt: "x", responseMode: "text" }),
    /ai_agent_name_taken/,
  );
  const other = await service.create(auth, { ...routine, name: "Outro nome" });
  await assert.rejects(() => service.update(auth, other.id, { name: "Nome reservado" }), /ai_agent_name_taken/);
});
