import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const BUSINESS_CATEGORIES = [
  'restaurant',
  'shop',
  'autoservice',
  'clinic',
  'beauty',
  'other',
] as const;
export type BusinessCategoryValue = (typeof BUSINESS_CATEGORIES)[number];

export const LANGS = ['uz', 'ru'] as const;

export class CreateBusinessDto {
  @IsString() @MaxLength(160) name!: string;
  @IsEnum(BUSINESS_CATEGORIES) category!: BusinessCategoryValue;
  @IsString() @MaxLength(255) address!: string;
  @IsString() @MaxLength(120) district!: string;

  /** { mon: ["09:00","21:00"], ... } — closed day is null */
  @IsObject() workHours!: Record<string, [string, string] | null>;

  @Type(() => Number) @IsInt() @Min(0) @Max(100) maxDiscountPct = 0;

  @IsOptional() @IsEnum(LANGS) lang?: 'uz' | 'ru';
  @IsOptional() @Type(() => Number) geoLat?: number;
  @IsOptional() @Type(() => Number) geoLng?: number;
}

export class ListBusinessQuery {
  @IsOptional() @IsEnum(BUSINESS_CATEGORIES) category?: BusinessCategoryValue;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
}
