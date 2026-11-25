import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { AdminClient, AdminOverview, AdminPage, AdminPayment } from '@botir/shared';
import { ok } from '../common/http';
import { Admin } from './admin.guard';
import { AdminService } from './admin.service';

/** Owners only (ADMIN_PHONES): 401 without a token, 403 for everybody else. */
@Controller('admin')
@Admin()
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('overview')
  async overview() {
    return ok<AdminOverview>(await this.admin.overview());
  }

  @Get('clients')
  async clients(@Query('q') q?: string, @Query('plan') plan?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return ok<AdminPage<AdminClient>>(await this.admin.clients({ q, plan, limit, offset }));
  }

  @Get('payments')
  async payments(
    @Query('status') status?: string, @Query('kind') kind?: string, @Query('test') test?: string,
    @Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string,
  ) {
    return ok<AdminPage<AdminPayment>>(await this.admin.payments({ status, kind, test, q, limit, offset }));
  }
}
