import { NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

export function ensureOne<T extends QueryResultRow>(result: { rows: T[] }): T {
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundException('Resource not found');
  }
  return row;
}
