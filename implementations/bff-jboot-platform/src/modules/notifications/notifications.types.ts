export interface PlatformNotificationContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  scopes: string[];
  roles: string[];
}

export type PlatformNotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface PlatformNotificationRow {
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
  severity: PlatformNotificationSeverity;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface PublishPlatformNotificationInput {
  clientId: string;
  applicationSlug: string;
  moduleSlug?: string | null;
  recipientIdentityId: string;
  actorIdentityId?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  severity?: PlatformNotificationSeverity;
  payload?: Record<string, unknown>;
}
