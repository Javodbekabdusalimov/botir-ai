import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '../common/file.interceptor';
import type { CatalogItem } from '@prisma/client';
import { AuthedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessesService } from '../businesses/businesses.service';
import { CatalogImportResult, CatalogService } from './catalog.service';
import { CatalogItemDto, UpdateCatalogItemDto } from './dto';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Controller('businesses/:id/catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly businesses: BusinessesService,
  ) {}

  @Get()
  async list(@Param('id') businessId: string): Promise<CatalogItem[]> {
    await this.businesses.findOrFail(businessId);
    return this.catalog.list(businessId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Req() req: AuthedRequest,
    @Param('id') businessId: string,
    @Body() dto: CatalogItemDto,
  ): Promise<CatalogItem> {
    await this.businesses.assertOwner(businessId, req.userId as string);
    return this.catalog.create(businessId, dto);
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async update(
    @Req() req: AuthedRequest,
    @Param('id') businessId: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItem> {
    await this.businesses.assertOwner(businessId, req.userId as string);
    return this.catalog.update(businessId, dto);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor)
  async import(
    @Req() req: AuthedRequest,
    @Param('id') businessId: string,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ): Promise<CatalogImportResult> {
    await this.businesses.assertOwner(businessId, req.userId as string);
    if (!file) throw new BadRequestException('file is required (multipart field "file")');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('file is larger than 5 MB');
    return this.catalog.importFile(businessId, file.buffer);
  }
}
