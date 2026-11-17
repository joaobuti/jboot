import { getApplicationAuthToken } from "./module-auth-token";

const baseUrl =
  process.env.NEXT_PUBLIC_JBOOT_AI_GATEWAY_API_URL ?? "http://127.0.0.1:8050";
export type AiCredential = {
  id: string;
  provider: string;
  last4: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};
export type AiProvider = {
  id: string;
  label: string;
  status: "active" | "disabled";
  capabilities: string[];
};
export type AiModel = { id: string; label: string; capabilities: string[] };
export type AiTool = {
  id: string;
  functionName: string;
  label: string;
  description: string;
  approvalPolicy: "automatic" | "human_review";
  inputSchema: Record<string, unknown>;
};
export type AiToolCatalog = { policyVersion: string; tools: AiTool[] };
/** `api`: chave BYOK + modelo + prompt no JBoot. `claude_routine`: rotina do Claude Code do dono. */
export type AiAgentExecutionMode = "api" | "claude_routine";
export type AiAgent = {
  id: string;
  applicationSlug: string;
  executionMode: AiAgentExecutionMode;
  credentialId: string | null;
  provider: string;
  name: string;
  description: string | null;
  model: string | null;
  routineFireUrl: string | null;
  routineTokenLast4: string | null;
  externalReference: string | null;
  activeVersion: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  responseMode: "text" | "json_schema";
  outputSchema: Record<string, unknown>;
  allowedTools: string[];
  toolPolicyVersion: string;
};
export type AiInteraction = {
  id: string;
  status: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  output: unknown | null;
  outputAvailable: boolean;
  replayed: boolean;
  requestedActions: Array<{
    callId: string;
    toolId: string;
    arguments: Record<string, unknown>;
  }>;
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getApplicationAuthToken("app:flow");
  if (!token) throw new Error("Sessão do Flow não encontrada");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join("; ") : body?.message;
    throw new Error(message ?? "Falha ao acessar o serviço de IA");
  }
  return response.json() as Promise<T>;
}
export const aiGatewayApi = {
  providers: { list: () => request<AiProvider[]>("/v1/providers") },
  tools: { list: () => request<AiToolCatalog>("/v1/tools") },
  credentials: {
    list: () => request<AiCredential[]>("/v1/credentials"),
    models: (id: string) => request<AiModel[]>(`/v1/credentials/${id}/models`),
    create: (provider: string, apiKey: string) =>
      request<AiCredential>("/v1/credentials", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
      }),
    createAndValidate: async (provider: string, apiKey: string) => {
      const credential = await request<AiCredential>("/v1/credentials", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
      });
      const validation = await request<{ status: string }>(
        `/v1/credentials/${credential.id}/test`,
        { method: "POST" },
      );
      if (validation.status !== "active")
        throw new Error("Credencial não validada");
      return { ...credential, status: validation.status };
    },
    test: (id: string) =>
      request<{ status: string }>(`/v1/credentials/${id}/test`, {
        method: "POST",
      }),
    revoke: (id: string) =>
      request<AiCredential>(`/v1/credentials/${id}`, { method: "DELETE" }),
  },
  agents: {
    list: () => request<AiAgent[]>("/v1/agents"),
    create: (
      body:
        | {
            executionMode?: "api";
            credentialId: string;
            name: string;
            description?: string;
            model: string;
            systemPrompt: string;
            responseMode: "text" | "json_schema";
            outputSchema?: Record<string, unknown>;
            allowedTools?: string[];
            externalReference?: string;
          }
        | {
            executionMode: "claude_routine";
            name: string;
            description?: string;
            routineFireUrl: string;
            routineToken: string;
            systemPrompt?: string;
            externalReference?: string;
          },
    ) =>
      request<AiAgent>("/v1/agents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Record<string, unknown>) =>
      request<AiAgent>(`/v1/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deactivate: (id: string) =>
      request<AiAgent>(`/v1/agents/${id}`, { method: "DELETE" }),
  },
  interactions: {
    create: (
      agentId: string,
      input: Record<string, unknown>,
      requestId = crypto.randomUUID(),
    ) =>
      request<AiInteraction>("/v1/interactions", {
        method: "POST",
        headers: { "Idempotency-Key": requestId },
        body: JSON.stringify({ agentId, requestId, input }),
      }),
  },
};
