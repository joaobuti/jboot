import { BadRequestException, Injectable } from '@nestjs/common';
import { BrandingRepository, ClientBranding } from './branding.repository';

const MAX_LOGO_BYTES = 192 * 1024;
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/;

@Injectable()
export class BrandingService {
  constructor(private readonly repository: BrandingRepository) {}

  get(clientId: string): Promise<ClientBranding | null> {
    return this.repository.findByClient(clientId);
  }

  async save(clientId: string, input: ClientBranding): Promise<ClientBranding> {
    if (!input.logoDataUrl || !DATA_URL_PATTERN.test(input.logoDataUrl)) {
      throw new BadRequestException('Branding logo must be a base64 image data URL');
    }

    const byteLength = Buffer.byteLength(input.logoDataUrl, 'utf8');
    if (byteLength > MAX_LOGO_BYTES) {
      throw new BadRequestException('Branding logo payload too large');
    }

    const branding: ClientBranding = {
      logoDataUrl: input.logoDataUrl,
      displayName: input.displayName?.trim() || undefined
    };

    await this.repository.saveForClient(clientId, branding);
    return branding;
  }
}
