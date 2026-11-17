"use client";

interface JwtPayload {
  aud?: string | string[];
  exp?: number;
  scopes?: string[];
  scope?: string;
}

export function getApplicationAuthToken(audience: string, dedicatedCookieName?: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidates = [
    dedicatedCookieName ? readCookie(dedicatedCookieName) : null,
    readCookie("accessToken"),
    readAuthUserAccessToken(),
    dedicatedCookieName ? window.localStorage.getItem(dedicatedCookieName) : null,
    window.localStorage.getItem("accessToken")
  ];

  return candidates.find((token): token is string => Boolean(token && isTokenForAudience(token, audience))) ?? null;
}

export function getApplicationScopes(audience: string, dedicatedCookieName?: string): string[] {
  const token = getApplicationAuthToken(audience, dedicatedCookieName);
  if (!token) {
    return [];
  }
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload.scopes)) {
    return payload.scopes;
  }
  if (typeof payload.scope === "string") {
    return payload.scope.split(" ").filter(Boolean);
  }
  return [];
}

function readCookie(name: string): string | null {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function readAuthUserAccessToken(): string | null {
  const authUser = readCookie("authUser");
  if (!authUser) {
    return null;
  }

  try {
    const session = JSON.parse(authUser) as { accessToken?: string };
    return session.accessToken ?? null;
  } catch {
    return null;
  }
}

function isTokenForAudience(token: string, audience: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return false;
  }

  const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!tokenAudiences.includes(audience)) {
    return false;
  }

  return typeof payload.exp !== "number" || payload.exp * 1000 > Date.now();
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}
