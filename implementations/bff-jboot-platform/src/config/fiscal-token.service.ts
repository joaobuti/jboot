import { Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AppConfigService } from './app-config.service';

@Injectable()
export class FiscalTokenService {
  constructor(private readonly config: AppConfigService) {}

  async mint(clientId: string): Promise<string> {
    const secret = new TextEncoder().encode(this.config.fiscalInternalSecret);
    return new SignJWT({ sub: clientId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('svc:fiscal')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(secret);
  }
}
