import Cookies from "js-cookie";

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

export interface IdentityApplicationsResponse {
  identityId: string;
  sessionId?: string;
  destinations: IdentityDestination[];
}

export interface IdentitySwitchContextResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  destination: IdentityDestination;
}

export interface IdentityBranding {
  displayName?: string;
  logoDataUrl?: string;
}

const DEFAULT_IDENTITY_API_URL = "http://127.0.0.1:8000";
const DEFAULT_IDENTITY_WEB_URL = "http://localhost:3000/login";
const PLATFORM_WEB_URL = process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL?.replace(/\/$/, "") ?? "";

export const fallbackLaunchUrlBySlug: Record<string, string> = {
  "identity-admin": process.env.NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL?.replace(/\/$/, "") ?? DEFAULT_IDENTITY_WEB_URL,
  pdv: PLATFORM_WEB_URL ? `${PLATFORM_WEB_URL}/pdv` : "/pdv",
  juridico: PLATFORM_WEB_URL ? `${PLATFORM_WEB_URL}/juridico` : "/juridico",
  flow: PLATFORM_WEB_URL ? `${PLATFORM_WEB_URL}/flow` : "/flow",
};

export function getIdentityApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_JBOOT_IDENTITY_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    DEFAULT_IDENTITY_API_URL
  ).replace(/\/$/, "");
}

export function getIdentitySelectionUrl(): string {
  const configured = process.env.NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL;
  if (!configured) {
    return `${DEFAULT_IDENTITY_WEB_URL}?apps=1`;
  }
  try {
    const url = new URL("/login", configured);
    url.searchParams.set("apps", "1");
    return url.toString();
  } catch {
    return `${DEFAULT_IDENTITY_WEB_URL}?apps=1`;
  }
}

export function resolveDestinationLaunchUrl(destination: IdentityDestination): string {
  return destination.launchUrl ?? fallbackLaunchUrlBySlug[destination.applicationSlug] ?? "/";
}

export async function listIdentityApplications(): Promise<IdentityDestination[]> {
  const accessToken = Cookies.get("accessToken");
  if (!accessToken) {
    return destinationsFromAuthCookie();
  }

  const response = await fetch(`${getIdentityApiUrl()}/auth/me/applications`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return destinationsFromAuthCookie();
  }

  const data = (await response.json()) as IdentityApplicationsResponse;
  return data.destinations ?? [];
}

export async function switchIdentityApplication(destination: IdentityDestination): Promise<IdentitySwitchContextResponse> {
  const accessToken = Cookies.get("accessToken");
  if (!accessToken) {
    throw new Error("Missing access token");
  }

  const response = await fetch(`${getIdentityApiUrl()}/auth/me/context`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientId: destination.clientId,
      applicationId: destination.applicationId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Context switch failed (${response.status})`);
  }

  return response.json();
}

// Slugs com cookie dedicado proprio (alem do "accessToken"/"authUser"
// genericos), usado por modulos cujo cliente le um cookie fixo por nome
// (ex: pdv-api.ts le "pdvAccessToken"). Modulos sem cookie dedicado (ex:
// kanban) leem accessToken/authUser diretamente e nao precisam entrar
// aqui -- mas se ganharem um cookie dedicado no futuro, so precisam ser
// adicionados nesta lista, sem duplicar a logica de set/remove abaixo.
const MODULE_DEDICATED_COOKIES: Record<string, string> = {
  pdv: "pdvAccessToken",
  juridico: "juridicoAccessToken",
};

// Escopo de dominio dos cookies de sessao. Mesmo motivo do
// app-jboot-identity-admin/src/components/auth/GlobalLogin.tsx: sem isso,
// cookies setados aqui (app.jboot.com.br) nao seriam visiveis em outro
// subdominio caso o usuario navegue entre eles. Em dev fica undefined
// (comportamento por host, inalterado).
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export function persistSwitchedIdentityContext(data: IdentitySwitchContextResponse): void {
  Cookies.set("accessToken", data.accessToken, { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
  Object.values(MODULE_DEDICATED_COOKIES).forEach((cookieName) =>
    Cookies.remove(cookieName, { domain: COOKIE_DOMAIN })
  );

  const dedicatedCookie = MODULE_DEDICATED_COOKIES[data.destination.applicationSlug];
  if (dedicatedCookie) {
    Cookies.set(dedicatedCookie, data.accessToken, { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
  }

  const authUser = Cookies.get("authUser");
  if (authUser) {
    try {
      const parsed = JSON.parse(authUser) as Record<string, unknown>;
      Cookies.set(
        "authUser",
        JSON.stringify({
          ...parsed,
          accessToken: data.accessToken,
          tokenType: data.tokenType,
          expiresIn: data.expiresIn,
          destination: data.destination,
        }),
        { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN },
      );
    } catch {
      Cookies.set("authUser", JSON.stringify(data), { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
    }
  }
}

export async function getLayoutPreference(accessToken: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${getIdentityApiUrl()}/auth/me/layout-preference`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { preference: Record<string, unknown> | null };
  return data.preference ?? null;
}

export async function saveLayoutPreference(accessToken: string, preference: Record<string, unknown>): Promise<void> {
  await fetch(`${getIdentityApiUrl()}/auth/me/layout-preference`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ preference }),
  });
}

export async function getBranding(accessToken: string): Promise<IdentityBranding | null> {
  const response = await fetch(`${getIdentityApiUrl()}/auth/me/branding`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { branding: IdentityBranding | null };
  return data.branding ?? null;
}

export async function saveBranding(accessToken: string, branding: IdentityBranding): Promise<IdentityBranding> {
  const response = await fetch(`${getIdentityApiUrl()}/auth/me/branding`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(branding),
  });

  if (!response.ok) {
    throw new Error(`Branding save failed (${response.status})`);
  }

  const data = (await response.json()) as { branding: IdentityBranding };
  return data.branding;
}

function destinationsFromAuthCookie(): IdentityDestination[] {
  const authUser = Cookies.get("authUser");
  if (!authUser) {
    return [];
  }

  try {
    const parsed = JSON.parse(authUser) as {
      destinations?: IdentityDestination[];
      destination?: IdentityDestination;
    };
    if (parsed.destinations?.length) {
      return parsed.destinations;
    }
    return parsed.destination ? [parsed.destination] : [];
  } catch {
    return [];
  }
}
