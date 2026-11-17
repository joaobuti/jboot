import { Injectable } from '@nestjs/common';
import { PdvRequestContext } from '../admin.types';
import { DashboardRepository, DashboardPeriod } from './dashboard.repository';

const VALID_PERIODS: DashboardPeriod[] = ['today', 'week', 'month'];

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getDashboard(context: PdvRequestContext, period: string, requestedLocationId?: string) {
    const safePeriod: DashboardPeriod = VALID_PERIODS.includes(period as DashboardPeriod)
      ? (period as DashboardPeriod)
      : 'today';

    const isAdmin = context.roles.includes('admin');

    // Admin can filter by specific store or see all (null = all).
    // Non-admin is always scoped to their own store.
    const effectiveLocationId = isAdmin
      ? (requestedLocationId ?? null)
      : (context.locationId ?? null);

    return this.repository.getDashboard(context.clientId, safePeriod, effectiveLocationId);
  }
}
