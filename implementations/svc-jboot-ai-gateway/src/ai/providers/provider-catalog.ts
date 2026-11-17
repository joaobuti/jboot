import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export interface ProviderDescriptor { id: string; label: string; status: 'active' | 'disabled'; capabilities: string[] }

@Injectable()
export class ProviderCatalog {
  constructor(private readonly config: AppConfigService) {}

  private providers(): ProviderDescriptor[] {
    return [
      {
        id: 'openai',
        label: 'OpenAI (GPT)',
        status: this.config.isProviderEnabled('openai') ? 'active' : 'disabled',
        capabilities: ['credential-test', 'model-catalog', 'text-output', 'structured-output'],
      },
      {
        id: 'anthropic',
        label: 'Claude (Anthropic)',
        status: this.config.isProviderEnabled('anthropic') ? 'active' : 'disabled',
        capabilities: ['credential-test', 'model-catalog', 'text-output', 'structured-output'],
      },
    ];
  }

  list() { return this.providers().map((provider) => ({ ...provider, capabilities: [...provider.capabilities] })); }
  requireActive(id: string) {
    const provider = this.providers().find((candidate) => candidate.id === id && candidate.status === 'active');
    if (!provider) throw new BadRequestException('Provider not enabled');
    return provider;
  }
}
