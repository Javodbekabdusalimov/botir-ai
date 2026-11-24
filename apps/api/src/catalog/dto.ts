import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CatalogItemDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @Type(() => Number) @IsInt() @Min(0) price!: number;
  @IsString() @MaxLength(40) unit!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMin?: number;
  @IsOptional() @IsBoolean() inStock?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateCatalogItemDto {
  @IsString() id!: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMin?: number;
  @IsOptional() @IsBoolean() inStock?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
