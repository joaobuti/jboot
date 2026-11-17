"use client";

import { ComandaSessionResult } from "./comanda-public-api";

export interface StoredComandaSession extends ComandaSessionResult {}

function storageKey(tableToken: string): string {
  return `jboot_comanda_session:${tableToken}`;
}

export function loadComandaSession(tableToken: string): StoredComandaSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(storageKey(tableToken));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredComandaSession;
  } catch {
    return null;
  }
}

export function saveComandaSession(tableToken: string, session: StoredComandaSession): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey(tableToken), JSON.stringify(session));
}

export function clearComandaSession(tableToken: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(storageKey(tableToken));
}
