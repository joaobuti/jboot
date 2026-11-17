import { Injectable } from '@nestjs/common';
import { PageQuery } from '../admin.types';
import { AuditEventsRepository } from './audit-events.repository';

@Injectable()
export class AuditEventsService {
  constructor(private readonly repository: AuditEventsRepository) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }
}
