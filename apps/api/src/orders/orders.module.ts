import { Controller, Get, Injectable, Param, Query, Req, UseGuards, Module } from '@nestjs/common';
import { IsEnum, IsOptional } from 'class-validator';
import type { Order, OrderStatus } from '@prisma/client';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessesModule } from '../businesses/businesses.module';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../prisma/prisma.service';

const ORDER_STATUSES = ['draft', 'pending_confirm', 'confirmed', 'paid', 'cancelled'] as const;

export class ListOrdersQuery {
  @IsOptional() @IsEnum(ORDER_STATUSES) status?: OrderStatus;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string, status?: OrderStatus): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { businessId, isDeleted: false, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@Controller('businesses/:id/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly businesses: BusinessesService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: AuthedRequest,
    @Param('id') businessId: string,
    @Query() query: ListOrdersQuery,
  ): Promise<Order[]> {
    await this.businesses.assertOwner(businessId, req.userId as string);
    return this.orders.list(businessId, query.status);
  }
}

@Module({
  imports: [BusinessesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
