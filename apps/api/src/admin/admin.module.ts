// Admin wiring, spread into AppModule (same pattern as billing.module.ts: reuses AppModule's PrismaService / AGENTS).
import type { Provider, Type } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

export const ADMIN_CONTROLLERS: Type[] = [AdminController];
export const ADMIN_PROVIDERS: Provider[] = [AdminService, AdminGuard];
