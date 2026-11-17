import { Injectable } from '@nestjs/common';
import { MutateContext, PageQuery } from '../admin.types';
import { PdvAuditService } from '../../../shared/pdv-audit/pdv-audit.service';
import { CreateOperatorDto, UpdateOperatorDto } from './dto/operator.dto';
import { OperatorsRepository } from './operators.repository';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly audit: PdvAuditService,
    private readonly repository: OperatorsRepository
  ) {}

  list(clientId: string, query: PageQuery) {
    return this.repository.list(clientId, query);
  }

  async create(clientId: string, dto: CreateOperatorDto, context: MutateContext) {
    const result = await this.repository.create(clientId, dto);
    await this.audit.record('pdv_operator_created', context, { operatorId: result.id, identityId: result.identityId });
    return result;
  }

  async update(clientId: string, id: string, dto: UpdateOperatorDto, context: MutateContext) {
    const result = await this.repository.update(clientId, id, dto);
    await this.audit.record('pdv_operator_updated', context, { operatorId: id });
    return result;
  }
}
