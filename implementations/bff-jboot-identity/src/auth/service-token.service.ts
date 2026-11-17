import { HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { ServiceTokenDto, ServiceTokenResponseDto } from './dto/service-token.dto';
import { IdentityJwtService } from './jwt.service';

@Injectable()
export class ServiceTokenService {
  private readonly failedAttempts = new Map<string, number[]>();

  constructor(
    private readonly config: AppConfigService,
    private readonly jwt: IdentityJwtService,
  ) {}

  async issue(input: ServiceTokenDto, sourceIp = 'unknown'): Promise<ServiceTokenResponseDto> {
    this.assertAttemptBudget(sourceIp);
    const client = this.resolveClient(input.clientId);
    const expectedSecret = client?.secret;
    if (!expectedSecret) {
      throw new ServiceUnavailableException('Service credentials are not configured');
    }
    if (
      !client || !client.audiences.has(input.audience) ||
      !this.matches(input.clientSecret, expectedSecret)
    ) {
      this.recordFailure(sourceIp);
      throw new UnauthorizedException('Invalid service credentials');
    }
    return {
      accessToken: await this.jwt.issueServiceAccessToken(input.clientId, input.audience),
      tokenType: 'Bearer',
      expiresIn: this.config.serviceAccessTokenTtlSeconds,
    };
  }

  private resolveClient(clientId: string): { secret: string; audiences: Set<string> } | null {
    if (clientId === this.config.platformServiceClientId) {
      return { secret: this.config.platformServiceClientSecret, audiences: this.config.platformServiceAudiences };
    }
    if (clientId === this.config.workerServiceClientId) {
      return { secret: this.config.workerServiceClientSecret, audiences: this.config.workerServiceAudiences };
    }
    return null;
  }

  private matches(actual: string, expected: string): boolean {
    const actualHash = createHash('sha256').update(actual).digest();
    const expectedHash = createHash('sha256').update(expected).digest();
    return timingSafeEqual(actualHash, expectedHash);
  }

  private assertAttemptBudget(sourceIp: string): void {
    const cutoff = Date.now() - 60_000;
    const recent = (this.failedAttempts.get(sourceIp) ?? []).filter((timestamp) => timestamp >= cutoff);
    if (recent.length >= 10) {
      throw new HttpException('Too many service credential attempts', 429);
    }
    if (recent.length > 0) this.failedAttempts.set(sourceIp, recent);
    else this.failedAttempts.delete(sourceIp);
  }

  private recordFailure(sourceIp: string): void {
    if (this.failedAttempts.size > 10_000) this.failedAttempts.clear();
    const attempts = this.failedAttempts.get(sourceIp) ?? [];
    attempts.push(Date.now());
    this.failedAttempts.set(sourceIp, attempts);
  }
}
