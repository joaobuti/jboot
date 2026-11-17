"use client";

/** Sessao do Identity gravada no cookie `authUser` no login (nome do usuario e destino). */
export interface PlatformSessionInfo {
  displayName: string | null;
  applicationSlug: string | null;
}

export function readPlatformSession(cookie: string): PlatformSessionInfo {
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("authUser="));
  if (!raw) return { displayName: null, applicationSlug: null };
  try {
    const session = JSON.parse(decodeURIComponent(raw.split("=").slice(1).join("="))) as {
      identity?: { displayName?: string };
      destination?: { applicationSlug?: string };
    };
    return { displayName: session.identity?.displayName ?? null, applicationSlug: session.destination?.applicationSlug ?? null };
  } catch {
    return { displayName: null, applicationSlug: null };
  }
}

/** Primeiro nome para a barra superior: "JOSÉ EDERVANDES VIDAL CHAGAS" -> "José". */
export function firstName(displayName: string | null | undefined): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  const lower = first.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}
