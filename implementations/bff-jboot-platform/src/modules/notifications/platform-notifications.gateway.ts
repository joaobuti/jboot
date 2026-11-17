import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppConfigService } from '../../config/app-config.service';
import { PlatformNotificationContext, PlatformNotificationRow } from './notifications.types';
import { verifyPlatformToken } from './shared/platform-token';

interface AuthenticatedSocket extends Socket {
  platformNotificationContext?: PlatformNotificationContext;
}

@WebSocketGateway({
  namespace: '/platform/ws',
  cors: { origin: true, credentials: true }
})
@Injectable()
export class PlatformNotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PlatformNotificationsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly config: AppConfigService) {}

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      socket.platformNotificationContext = await verifyPlatformToken(this.config, token);
      const context = socket.platformNotificationContext;
      await socket.join(this.identityRoom(context.clientId, context.identityId));
    } catch (error) {
      this.logger.warn(`Rejected platform websocket handshake: ${(error as Error).message}`);
      socket.disconnect(true);
    }
  }

  emitNotification(notification: PlatformNotificationRow): void {
    const rooms = [
      this.identityRoom(notification.clientId, notification.recipientIdentityId),
      this.applicationRoom(notification.clientId, notification.applicationSlug, notification.recipientIdentityId)
    ];
    if (notification.moduleSlug) {
      rooms.push(this.moduleRoom(notification.clientId, notification.moduleSlug, notification.recipientIdentityId));
    }
    for (const room of rooms) {
      this.server.to(room).emit('notification.created', notification);
    }
  }

  private identityRoom(clientId: string, identityId: string): string {
    return `notifications:client:${clientId}:identity:${identityId}`;
  }

  private applicationRoom(clientId: string, applicationSlug: string, identityId: string): string {
    return `notifications:client:${clientId}:app:${applicationSlug}:identity:${identityId}`;
  }

  private moduleRoom(clientId: string, moduleSlug: string, identityId: string): string {
    return `notifications:client:${clientId}:module:${moduleSlug}:identity:${identityId}`;
  }

  private extractToken(socket: Socket): string | null {
    const fromAuth = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return null;
  }
}
