"use client";

import Cookies from "js-cookie";
import { getIdentityApiUrl } from "./identity-applications";

export interface ManagedUser {
  identityId: string;
  documentType: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  identityStatus: string;
  entitlementStatus: string;
  scopes: string[];
  roles: string[];
  grantedAt: string;
}

export interface CreateManagedUserPayload {
  documentType: "cpf" | "cnpj";
  documentNumber: string;
  displayName: string;
  email?: string;
  phone?: string;
  password?: string;
  locationId?: string;
}

export interface ModulePermissionOption { key: string; label: string; }
export interface ModulePermissionCatalog {
  scopes: ModulePermissionOption[];
  roles: ModulePermissionOption[];
}

function getAccessToken(): string {
  const token = Cookies.get("accessToken");
  if (!token) throw new Error("Missing access token");
  return token;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/users`, {
    headers: { authorization: `Bearer ${getAccessToken()}` }
  });
  if (!response.ok) throw new Error(`Failed to list users (${response.status})`);
  return response.json();
}

export async function createManagedUser(payload: CreateManagedUserPayload): Promise<void> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/users`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Failed to create user (${response.status})`);
  }
}

export async function getModulePermissionCatalog(): Promise<ModulePermissionCatalog> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/module-permissions`, {
    headers: { authorization: `Bearer ${getAccessToken()}` }
  });
  if (!response.ok) throw new Error(`Failed to load module permissions (${response.status})`);
  return response.json();
}

export async function replaceManagedUserPermissions(
  identityId: string,
  payload: { scopes: string[]; roles: string[] }
): Promise<void> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/users/${identityId}/module-permissions`, {
    method: "PUT",
    headers: { authorization: `Bearer ${getAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Failed to update module permissions (${response.status})`);
  }
}

export async function updateManagedUserStatus(identityId: string, status: "active" | "suspended" | "revoked"): Promise<void> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/users/${identityId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error(`Failed to update user (${response.status})`);
}

export interface IdentityLookup {
  id: string;
  documentType: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: string;
}

export async function lookupIdentityByDocument(documentNumber: string): Promise<IdentityLookup | null> {
  const digits = documentNumber.replace(/\D/g, "");
  if (!digits) return null;
  const response = await fetch(
    `${getIdentityApiUrl()}/manager/users/lookup?documentNumber=${encodeURIComponent(digits)}`,
    { headers: { authorization: `Bearer ${getAccessToken()}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return response.json();
}

export async function revokeManagedUser(identityId: string): Promise<void> {
  const response = await fetch(`${getIdentityApiUrl()}/manager/users/${identityId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${getAccessToken()}` }
  });
  if (!response.ok) throw new Error(`Failed to revoke user (${response.status})`);
}
