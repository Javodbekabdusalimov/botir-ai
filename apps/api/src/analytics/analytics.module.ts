import { Controller, Get, Injectable, Module, Param, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessesModule } from '../businesses/businesses.module';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../prisma/prisma.service';

export interface Analytics {
  topRequests: { query: string; count: number }[];
  notFound: { query: string; count: number }[];
  lostCustomers: { userId: string; name: string; lastOrderAt: string }[];
  revenue: { today: number; week: number; month: number };
}

const TOP_LIMIT = 10;
const LOST_CUSTOMER_DAYS = 30;
const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(businessId: string): Promise<Analytics> {
    const since = new Date(Date.now() - LOST_CUSTOMER_DAYS * DAY_MS);

    const [requests, rejects, paidOrders, lost] = await Promise.all([
      this.prisma.negotiationMessage.findMany({
        where: { businessId, type: 'REQUEST', isDeleted: false },
        select: { text: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.negotiationMessage.findMany({
        where: { businessId, type: 'REJECT', isDeleted: false },
        select: { text: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: { businessId, status: 'paid', isDeleted: false },
        select: { total: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { businessId, isDeleted: false, createdAt: { lt: since } },
        select: { userId: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: TOP_LIMIT,
      }),
    ]);

    const now = Date.now();
    const sumSince = (ms: number): number =>
      paidOrders
        .filter((order) => now - order.createdAt.getTime() <= ms)
        .reduce((sum, order) => sum + order.total, 0);

    return {
      topRequests: this.tally(requests.map((row) => row.text)),
      notFound: this.tally(rejects.map((row) => row.text)),
      lostCustomers: lost.map((order) => ({
        userId: order.userId,
        name: order.user.name,
        lastOrderAt: order.createdAt.toISOString(),
      })),
      revenue: {
        today: sumSince(DAY_MS),
        week: sumSince(7 * DAY_MS),
        month: sumSince(30 * DAY_MS),
      },
    };
  }

  private tally(lines: string[]): { query: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const line of lines) {
      const key = line.slice(0, 120);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_LIMIT);
  }
}

@Controller('businesses/:id/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly businesses: BusinessesService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async get(@Req() req: AuthedRequest, @Param('id') businessId: string): Promise<Analytics> {
    await this.businesses.assertOwner(businessId, req.userId as string);
    return this.analytics.build(businessId);
  }
}

@Module({
  imports: [BusinessesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
