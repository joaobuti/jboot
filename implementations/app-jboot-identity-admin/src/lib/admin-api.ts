import Cookies from "js-cookie";

export interface AdminClient {
  id: string;
  clientType: string;
  documentType?: string;
  legalName: string;
  tradeName?: string;
  status: string;
  /** Mensalidade do contratante em reais (informativa); null = nao informada. */
  monthlyFee?: number | null;
  createdAt: string;
}

/** Banco de cada modulo contratado x regra atual do app (docs/product/tenant-isolation-sprints.md). */
export interface AdminClientDatabase {
  clientId: string;
  clientName: string;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  ruleStrategy: string | null;
  ruleSupported: boolean;
  current: {
    id: string;
    databaseId: string | null;
    strategy: string;
    databaseName: string;
    schemaName: string | null;
    status: string;
  } | null;
  followsRule: boolean;
  canApply: boolean;
  blockedReason: "rule_missing" | "rule_not_supported" | "data_in_other_database" | null;
}

export const DATABASE_BLOCKED_LABELS: Record<string, string> = {
  rule_missing: "o app nao tem regra de banco principal",
  rule_not_supported: "a regra usa um isolamento ainda nao implementado",
  data_in_other_database: "os dados do cliente estao em outro banco; trocar exige migracao",
};

export const ISOLATION_LABELS: Record<string, string> = {
  none: "Sem banco",
  shared_db: "Database compartilhado",
  schema_per_client: "Schema por cliente",
  dedicated_database: "Database dedicado",
  dedicated_db: "Database dedicado",
};

export const DATABASE_REF_STATUS_LABELS: Record<string, string> = {
  active: "ativo",
  provisioning: "em criacao",
  failed: "falhou",
  migrating: "migrando",
  disabled: "desativado",
};

/** Resultado do convite de criar senha (docs/product/account-access-email-sprints.md). */
export interface AdminInviteResult {
  sent: boolean;
  reason?: "no_email" | "send_failed";
}

export function inviteMessage(result: AdminInviteResult): string {
  if (result.sent) return "Convite enviado para o e-mail do admin.";
  if (result.reason === "no_email") return "Convite nao enviado: o admin nao tem e-mail cadastrado.";
  return "Convite nao enviado: falha no envio do e-mail. Reenvie pela tela de Usuarios.";
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface AdminApplication {
  id: string;
  slug: string;
  name: string;
  tokenAudience: string;
  status: string;
  createdAt: string;
}

export interface AdminIdentity {
  id: string;
  documentType: string;
  displayName: string;
  email?: string;
  phone?: string;
  status: string;
  createdAt: string;
}

export interface AdminDatabase {
  id: string;
  slug: string;
  name: string;
  engine: string;
  connectionName: string;
  defaultDatabaseName: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminApplicationDatabase {
  id: string;
  applicationId: string;
  databaseId?: string;
  databaseSlug?: string;
  databaseName?: string;
  role: string;
  isolationStrategy: string;
  required: boolean;
  status: string;
}

/**
 * Sub-modulo contratavel de uma application (ex: `comanda` e `fiscal` sob
 * `pdv`). `applicationSlug` null = capability s2s pura, sem application pai.
 */
export interface AdminCapability {
  slug: string;
  label: string;
  description: string | null;
  serviceName: string | null;
  applicationSlug: string | null;
  /** Sem application, mas contratada por cliente (ex.: DataJud, DJEN). */
  clientContractable: boolean;
  /** Capability que precisa estar ligada antes desta. */
  requiresCapability: string | null;
  active: boolean;
}

export interface AdminClientCapability extends AdminCapability {
  enabled: boolean;
  enabledAt: string | null;
}

export interface AdminClientApplication {
  id: string;
  clientId: string;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  status: string;
  planCode?: string;
  billingRef?: string;
}

const apiUrl =
  process.env.NEXT_PUBLIC_JBOOT_IDENTITY_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

function token() {
  const raw = Cookies.get("authUser");
  if (!raw) {
    throw new Error("Sessao administrativa nao encontrada");
  }
  return JSON.parse(raw).accessToken as string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Falha na requisicao administrativa (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const adminApi = {
  clients: {
    list: () => request<AdminClient[]>("/admin/clients?limit=100"),
    create: (data: {
      clientType: string;
      documentType?: string;
      documentNumber?: string;
      legalName: string;
      tradeName?: string;
      monthlyFee?: number | null;
    }) => request<AdminClient>("/admin/clients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<AdminClient, "clientType" | "legalName" | "tradeName" | "status" | "monthlyFee">>) =>
      request<AdminClient>(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<AdminClient>(`/admin/clients/${id}`, { method: "DELETE" }),
  },
  applications: {
    list: () => request<AdminApplication[]>("/admin/applications?limit=100"),
    create: (data: { slug: string; name: string; tokenAudience: string }) =>
      request<AdminApplication>("/admin/applications", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<AdminApplication, "name" | "tokenAudience" | "status">>) =>
      request<AdminApplication>(`/admin/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<AdminApplication>(`/admin/applications/${id}`, { method: "DELETE" }),
  },
  clientApplications: {
    list: (clientId: string) =>
      request<AdminClientApplication[]>(`/admin/clients/${clientId}/applications?limit=100`),
    create: (clientId: string, data: { applicationId: string; status?: string; planCode?: string }) =>
      request<AdminClientApplication>(`/admin/clients/${clientId}/applications`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (clientId: string, applicationId: string, data: { status?: string; planCode?: string }) =>
      request<AdminClientApplication>(`/admin/clients/${clientId}/applications/${applicationId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (clientId: string, applicationId: string) =>
      request<AdminClientApplication>(`/admin/clients/${clientId}/applications/${applicationId}`, {
        method: "DELETE",
      }),
  },
  capabilities: {
    list: (applicationSlug?: string) =>
      request<AdminCapability[]>(
        `/admin/capabilities${applicationSlug ? `?applicationSlug=${encodeURIComponent(applicationSlug)}` : ""}`
      ),
  },
  clientCapabilities: {
    list: (clientId: string) =>
      request<AdminClientCapability[]>(`/admin/clients/${clientId}/capabilities`),
    set: (clientId: string, capabilities: Array<{ slug: string; enabled: boolean }>) =>
      request<AdminClientCapability[]>(`/admin/clients/${clientId}/capabilities`, {
        method: "PUT",
        body: JSON.stringify({ capabilities }),
      }),
  },
  identities: {
    list: () => request<AdminIdentity[]>("/admin/identities?limit=100"),
    create: (data: {
      documentType: string;
      documentNumber: string;
      displayName: string;
      email?: string;
      phone?: string;
      password?: string;
    }) => request<AdminIdentity>("/admin/identities", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<AdminIdentity, "displayName" | "email" | "phone" | "status">>) =>
      request<AdminIdentity>(`/admin/identities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<AdminIdentity>(`/admin/identities/${id}`, { method: "DELETE" }),
    /** Reenvia o convite de criar senha (so conta pendente). */
    invite: (id: string) => request<AdminInviteResult>(`/admin/identities/${id}/invite`, { method: "POST" }),
  },
  databases: {
    list: () => request<AdminDatabase[]>("/admin/databases?limit=100"),
    create: (data: {
      slug: string;
      name: string;
      engine: string;
      connectionName: string;
      defaultDatabaseName: string;
    }) => request<AdminDatabase>("/admin/databases", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<AdminDatabase, "name" | "connectionName" | "defaultDatabaseName" | "status">>) =>
      request<AdminDatabase>(`/admin/databases/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<AdminDatabase>(`/admin/databases/${id}`, { method: "DELETE" }),
  },
  clientAccess: {
    /** Pacote de admin completo em todos os modulos contratados (e banco pela regra, se faltar). */
    reapplyAdmin: (clientId: string) =>
      request<{ applications: number; admins: number; databasesPending: string[] }>(`/admin/clients/${clientId}/admin-access`, { method: "POST" }),
  },
  clientDatabases: {
    list: (clientId: string) => request<AdminClientDatabase[]>(`/admin/clients/${clientId}/databases`),
    applyRule: (clientId: string, applicationId: string) =>
      request<AdminClientDatabase>(`/admin/clients/${clientId}/databases/${applicationId}/apply-rule`, { method: "POST" }),
    alignment: (applicationId: string) =>
      request<{ total: number; outdated: AdminClientDatabase[] }>(`/admin/applications/${applicationId}/client-databases`),
    applyRuleToAll: (applicationId: string) =>
      request<{ applied: number; skipped: number }>(`/admin/applications/${applicationId}/client-databases/apply-rule`, { method: "POST" }),
  },
  applicationDatabases: {
    list: (applicationId: string) =>
      request<AdminApplicationDatabase[]>(`/admin/applications/${applicationId}/databases?limit=100`),
    create: (
      applicationId: string,
      data: { databaseId?: string; role?: string; isolationStrategy: string; required?: boolean }
    ) =>
      request<AdminApplicationDatabase>(`/admin/applications/${applicationId}/databases`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      applicationId: string,
      id: string,
      data: Partial<Pick<AdminApplicationDatabase, "databaseId" | "isolationStrategy" | "required" | "status">>
    ) =>
      request<AdminApplicationDatabase>(`/admin/applications/${applicationId}/databases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (applicationId: string, id: string) =>
      request<AdminApplicationDatabase>(`/admin/applications/${applicationId}/databases/${id}`, { method: "DELETE" }),
  },
  onboarding: {
    createClient: (data: {
      client: {
        clientType: string;
        documentType?: string;
        documentNumber?: string;
        legalName: string;
        tradeName?: string;
        monthlyFee?: number | null;
      };
      application: {
        applicationId: string;
        status?: string;
        planCode?: string;
        billingRef?: string;
      };
      applications?: {
        applicationId: string;
        status?: string;
        planCode?: string;
        billingRef?: string;
      }[];
      admin: {
        documentType: string;
        documentNumber: string;
        displayName: string;
        /** Recebe o convite para criar a senha. */
        email: string;
      };
    }) => request<{ client: AdminClient; invite: AdminInviteResult }>("/admin/client-onboarding", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  },
};
