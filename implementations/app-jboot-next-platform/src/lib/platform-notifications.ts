"use client";

import { io, Socket } from "socket.io-client";
import { getPlatformAuthToken } from "@/lib/platform-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PLATFORM_API_URL ?? "http://127.0.0.1:8010";

export interface PlatformNotificationDto {
  id: string;
  clientId: string;
  applicationSlug: string;
  moduleSlug: string | null;
  recipientIdentityId: string;
  actorIdentityId: string | null;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  severity: "info" | "success" | "warning" | "danger";
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function platformNotificationsToQueryString(filters: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getPlatformAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Platform API error ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const platformNotificationsApi = {
  list: (filters: { applicationSlug?: string; moduleSlug?: string; unreadOnly?: boolean } = {}) =>
    request<PlatformNotificationDto[]>(`/notifications${platformNotificationsToQueryString(filters)}`),
  summary: (filters: { applicationSlug?: string; moduleSlug?: string } = {}) =>
    request<{ unreadCount: number }>(`/notifications/summary${platformNotificationsToQueryString(filters)}`),
  markRead: (notificationId: string) =>
    request<void>(`/notifications/${notificationId}/read`, { method: "PATCH" }),
  markAllRead: (filters: { applicationSlug?: string; moduleSlug?: string } = {}) =>
    request<void>(`/notifications/read-all${platformNotificationsToQueryString(filters)}`, { method: "PATCH" }),
};

export function connectPlatformNotificationsSocket(): Socket {
  return io(`${API_BASE}/platform/ws`, {
    auth: { token: getPlatformAuthToken() },
    transports: ["websocket"],
  });
}
