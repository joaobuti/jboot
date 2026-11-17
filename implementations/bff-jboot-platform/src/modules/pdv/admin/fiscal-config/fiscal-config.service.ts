import { Injectable } from '@nestjs/common';
import { PdvRequestContext } from '../admin.types';
import { UpsertFiscalConfigDto } from './dto/fiscal-config.dto';
import { FiscalConfigRepository, FiscalConfigRow } from './fiscal-config.repository';

@Injectable()
export class FiscalConfigService {
  constructor(private readonly repository: FiscalConfigRepository) {}

  async get(context: PdvRequestContext): Promise<FiscalConfigRow | null> {
    return this.repository.find(context.clientId);
  }

  async upsert(context: PdvRequestContext, dto: UpsertFiscalConfigDto): Promise<FiscalConfigRow> {
    return this.repository.upsert(context.clientId, dto);
  }
}
