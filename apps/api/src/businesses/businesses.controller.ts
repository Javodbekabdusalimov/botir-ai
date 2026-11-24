import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Business } from '@prisma/client';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto, ListBusinessQuery } from './dto';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get()
  list(@Query() query: ListBusinessQuery): Promise<Business[]> {
    return this.businesses.list(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthedRequest, @Body() dto: CreateBusinessDto): Promise<Business> {
    return this.businesses.create(req.userId as string, dto);
  }
}
