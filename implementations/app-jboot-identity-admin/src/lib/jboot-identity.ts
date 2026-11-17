export interface IdentityDestination {
  clientId: string;
  clientName: string;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  launchUrl?: string | null;
  roles: string[];
  scopes: string[];
}

export interface IdentityLoginResponse {
  selectionRequired: boolean;
  identity: {
    id: string;
    displayName: string;
    documentType: "cpf" | "cnpj";
  };
  loginTicket?: string;
  destinations?: IdentityDestination[];
  destination?: IdentityDestination;
  accessToken?: string;
  tokenType?: "Bearer";
  expiresIn?: number;
  context?: {
    sessionId: string;
    roles: string[];
    scopes: string[];
  };
}

export interface AdminSession {
  identity: IdentityLoginResponse["identity"];
  destination: IdentityDestination;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export type IdentitySession = AdminSession;

export interface IdentitySelection {
  selectionRequired: true;
  identity: IdentityLoginResponse["identity"];
  loginTicket?: string;
  expiresIn: number;
  destinations: IdentityDestination[];
}

export type IdentityLoginResult = IdentitySession | IdentitySelection;

export class IdentityContextSelectionError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "IdentityContextSelectionError";
  }
}

const apiUrl =
  process.env.NEXT_PUBLIC_JBOOT_IDENTITY_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

const defaultDestinationUrls: Record<string, string> = {
  "identity-admin": "/identity",
  pdv: process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL
    ? `${process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL.replace(/\/$/, "")}/pdv`
    : "http://localhost:3002/pdv",
  juridico: process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL
    ? `${process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL.replace(/\/$/, "")}/juridico`
    : "http://localhost:3002/juridico",
  flow: process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL
    ? `${process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL.replace(/\/$/, "")}/flow`
    : "http://localhost:3002/flow",
};

export function resolvePostLoginUrl(session: IdentitySession): string {
  return (
    session.destination.launchUrl ??
    defaultDestinationUrls[session.destination.applicationSlug] ??
    "/dashboard"
  );
}

/**
 * Retorno pos-login para o consentimento OAuth do conector Claude do Flow.
 * So vale para sessao Flow e para a rota exata de consentimento da Platform
 * Web configurada; qualquer outro destino e ignorado (sem open redirect).
 */
export function resolveConsentReturnUrl(
  session: IdentitySession,
  returnTo: string | null
): string | null {
  if (!returnTo || session.destination.applicationSlug !== "flow") {
    return null;
  }
  try {
    const target = new URL(returnTo);
    const platform = new URL(
      process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL ?? "http://localhost:3002"
    );
    const isConsent =
      target.origin === platform.origin &&
      target.pathname === "/oauth/consentimento";
    return isConsent ? target.href : null;
  } catch {
    return null;
  }
}

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isGlobalAdminSession(session: IdentitySession): boolean {
  return (
    session.destination.applicationSlug === "identity-admin" &&
    session.destination.roles.includes("global_admin") &&
    session.destination.scopes.includes("identity:admin")
  );
}

async function selectIdentityContext(
  loginTicket: string,
  destination: IdentityDestination
): Promise<Omit<IdentityLoginResponse, "selectionRequired" | "identity" | "destination">> {
  const response = await fetch(`${apiUrl}/auth/context`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      loginTicket,
      clientId: destination.clientId,
      applicationId: destination.applicationId,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const detail = Array.isArray(body?.message) ? body.message.join("; ") : body?.message;
    const message =
      response.status === 401
        ? "Sessao de selecao expirada. Faca login novamente."
        : detail
          ? `Falha ao selecionar contexto de acesso: ${detail}`
          : `Falha ao selecionar contexto de acesso (${response.status})`;
    throw new IdentityContextSelectionError(message, response.status);
  }

  return response.json();
}

function assertIssuedContext(
  data: Omit<IdentityLoginResponse, "selectionRequired" | "identity" | "destination">
): asserts data is Omit<IdentityLoginResponse, "selectionRequired" | "identity" | "destination"> & {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
} {
  if (!data.accessToken || !data.tokenType || !data.expiresIn) {
    throw new Error("Resposta de selecao de contexto incompleta");
  }
}

export async function selectIdentityDestination(params: {
  identity: IdentityLoginResponse["identity"];
  loginTicket: string;
  destination: IdentityDestination;
}): Promise<IdentitySession> {
  const issued = await selectIdentityContext(params.loginTicket, params.destination);
  assertIssuedContext(issued);

  return {
    identity: params.identity,
    destination: params.destination,
    accessToken: issued.accessToken,
    tokenType: issued.tokenType,
    expiresIn: issued.expiresIn,
  };
}

export async function listIdentityApplications(accessToken: string): Promise<IdentityDestination[]> {
  const response = await fetch(`${apiUrl}/auth/me/applications`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Falha ao carregar aplicacoes habilitadas");
  }

  const data = (await response.json()) as { destinations?: IdentityDestination[] };
  return data.destinations ?? [];
}

export async function switchIdentityDestination(params: {
  identity: IdentityLoginResponse["identity"];
  accessToken: string;
  destination: IdentityDestination;
}): Promise<IdentitySession> {
  const response = await fetch(`${apiUrl}/auth/me/context`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientId: params.destination.clientId,
      applicationId: params.destination.applicationId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao trocar contexto de acesso (${response.status})`);
  }

  const data = (await response.json()) as {
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
    destination: IdentityDestination;
  };

  return {
    identity: params.identity,
    destination: data.destination,
    accessToken: data.accessToken,
    tokenType: data.tokenType,
    expiresIn: data.expiresIn,
  };
}

export function isIdentitySelection(result: IdentityLoginResult): result is IdentitySelection {
  return "selectionRequired" in result && result.selectionRequired;
}

export async function loginIdentity(document: string, password: string): Promise<IdentityLoginResult> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ document, password }),
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "Credenciais invalidas" : "Falha ao autenticar");
  }

  const data = (await response.json()) as IdentityLoginResponse;
  if (data.selectionRequired) {
    if (!data.loginTicket || !data.destinations?.length || !data.expiresIn) {
      throw new Error("Resposta de selecao de acesso incompleta");
    }

    return {
      selectionRequired: true,
      identity: data.identity,
      loginTicket: data.loginTicket,
      expiresIn: data.expiresIn,
      destinations: data.destinations,
    };
  }

  if (!data.accessToken || !data.destination || !data.tokenType || !data.expiresIn) {
    throw new Error("Resposta de autenticacao incompleta");
  }

  if (data.destination.applicationSlug === "identity-admin") {
    const hasAdminRole = data.destination.roles.includes("global_admin");
    const hasAdminScope = data.destination.scopes.includes("identity:admin");
    if (!hasAdminRole || !hasAdminScope) {
      throw new Error("Usuario autenticado nao possui permissao de administrador global");
    }
  }

  return {
    identity: data.identity,
    destination: data.destination,
    accessToken: data.accessToken,
    tokenType: data.tokenType,
    expiresIn: data.expiresIn,
  };
}

export async function loginAdmin(document: string, password: string): Promise<AdminSession> {
  const session = await loginIdentity(document, password);
  if (isIdentitySelection(session)) {
    throw new Error("Usuario possui multiplos destinos. Selecione um contexto de acesso.");
  }

  if (!isGlobalAdminSession(session)) {
    throw new Error("Usuario autenticado nao possui permissao de administrador global");
  }

  return session;
}

/** Link de criar/redefinir senha (docs/product/account-access-email-sprints.md). */
export interface AccessLinkInfo {
  purpose: "invite" | "password_reset";
  displayName: string;
  login: string;
}

const ACCESS_LINK_INVALID = "Este link e invalido, ja foi usado ou venceu.";

export async function checkAccessLink(token: string): Promise<AccessLinkInfo> {
  const response = await fetch(`${apiUrl}/auth/password/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error(response.status === 404 || response.status === 400 ? ACCESS_LINK_INVALID : "Falha ao conferir o link");
  return (await response.json()) as AccessLinkInfo;
}

export async function setAccessPassword(token: string, password: string): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/password/set`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) throw new Error(response.status === 404 ? ACCESS_LINK_INVALID : "Falha ao salvar a senha");
}

/** "Esqueci minha senha": o Identity responde sempre igual, exista ou nao o login. */
export async function requestPasswordReset(document: string): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/password/forgot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document }),
  });
  if (!response.ok) throw new Error("Falha ao enviar o pedido. Tente de novo.");
}
