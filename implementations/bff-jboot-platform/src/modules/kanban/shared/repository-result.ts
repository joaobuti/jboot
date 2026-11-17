import { NotFoundException } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';

export function ensureOne<T extends QueryResultRow>(result: QueryResult<T>): T {
  const [row] = result.rows;
  if (!row) {
    throw new NotFoundException('Resource not found');
  }
  return row;
}
