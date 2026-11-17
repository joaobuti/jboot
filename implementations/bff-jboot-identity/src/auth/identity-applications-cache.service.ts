import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../cache/redis-cache.service';
import { AppConfigService } from '../config/app-config.service';
import { AuthRepository } from './auth.repository';
import { DestinationRecord, IdentityApplicationsCacheEntry } from './auth.types';

@Injectable()
export class IdentityApplicationsCacheService {
  private readonly logger = new Logger(IdentityApplicationsCacheService.name);

  constructor(
    private readonly cache: RedisCacheService,
    private readonly config: AppConfigService,
    private readonly repository: AuthRepository
  ) {}

  async listDestinations(identityId: string): Promise<DestinationRecord[]> {
    const permissionsVersion = await this.repository.getPermissionsVersion(identityId);
    const key = this.cacheKey(identityId, permissionsVersion);

    try {
      const cached = await this.cache.get(key);
      if (cached) {
        const entry = JSON.parse(cached) as IdentityApplicationsCacheEntry;
        if (entry.identityId === identityId && entry.permissionsVersion === permissionsVersion) {
          return entry.destinations;
        }
      }
    } catch (error) {
      this.logger.warn(`Identity applications cache read failed: ${this.errorMessage(error)}`);
    }

    const destinations = await this.repository.listDestinations(identityId);
    const entry: IdentityApplicationsCacheEntry = {
      identityId,
      permissionsVersion,
      destinations,
      cachedAt: new Date().toISOString()
    };

    try {
      await this.cache.setex(key, this.config.identityApplicationsCacheTtlSeconds, JSON.stringify(entry));
    } catch (error) {
      this.logger.warn(`Identity applications cache write failed: ${this.errorMessage(error)}`);
    }

    return destinations;
  }

  async invalidateIdentity(identityId: string): Promise<number> {
    await this.repository.bumpPermissionsVersion(identityId);
    return this.deletePattern(this.identityPattern(identityId));
  }

  async invalidateClient(clientId: string): Promise<number> {
    const identities = await this.repository.listIdentityIdsForClient(clientId);
    await Promise.all(identities.map((identityId) => this.repository.bumpPermissionsVersion(identityId)));
    return this.deletePattern('identity:applications:*');
  }

  async invalidateApplication(applicationId: string): Promise<number> {
    const identities = await this.repository.listIdentityIdsForApplication(applicationId);
    await Promise.all(identities.map((identityId) => this.repository.bumpPermissionsVersion(identityId)));
    return this.deletePattern('identity:applications:*');
  }

  private async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.cache.scan(pattern);
      return this.cache.del(...keys);
    } catch (error) {
      this.logger.warn(`Identity applications cache invalidation failed: ${this.errorMessage(error)}`);
      return 0;
    }
  }

  private cacheKey(identityId: string, permissionsVersion: number): string {
    return `identity:applications:${identityId}:v${permissionsVersion}`;
  }

  private identityPattern(identityId: string): string {
    return `identity:applications:${identityId}:v*`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
