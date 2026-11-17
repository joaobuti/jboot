import { BadRequestException, Injectable } from '@nestjs/common';
import { LayoutPreferenceRepository } from './layout-preference.repository';

const MAX_PREFERENCE_BYTES = 8192;

@Injectable()
export class LayoutPreferenceService {
  constructor(private readonly repository: LayoutPreferenceRepository) {}

  async get(identityId: string): Promise<Record<string, unknown> | null> {
    return this.repository.find(identityId);
  }

  async save(identityId: string, preference: Record<string, unknown>): Promise<Record<string, unknown>> {
    const size = Buffer.byteLength(JSON.stringify(preference), 'utf8');
    if (size > MAX_PREFERENCE_BYTES) {
      throw new BadRequestException('Layout preference payload too large');
    }
    await this.repository.upsert(identityId, preference);
    return preference;
  }
}
