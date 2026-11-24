import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Business } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto, ListBusinessQuery } from './dto';

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListBusinessQuery): Promise<Business[]> {
    return this.prisma.business.findMany({
      where: {
        isDeleted: false,
        ...(query.category ? { category: query.category } : {}),
        ...(query.district ? { district: { contains: query.district, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(ownerUserId: string, dto: CreateBusinessDto): Promise<Business> {
    return this.prisma.business.create({
      data: {
        name: dto.name,
        category: dto.category,
        address: dto.address,
        district: dto.district,
        workHours: dto.workHours,
        maxDiscountPct: dto.maxDiscountPct,
        lang: dto.lang ?? 'uz',
        geoLat: dto.geoLat ?? null,
        geoLng: dto.geoLng ?? null,
        ownerUserId,
      },
    });
  }

  async findOrFail(businessId: string): Promise<Business> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, isDeleted: false },
    });
    if (!business) throw new NotFoundException('business not found');
    return business;
  }

  /** Tenant isolation: a caller may only mutate a business they own. */
  async assertOwner(businessId: string, userId: string): Promise<Business> {
    const business = await this.findOrFail(businessId);
    if (business.ownerUserId !== userId) throw new ForbiddenException('not your business');
    return business;
  }
}
