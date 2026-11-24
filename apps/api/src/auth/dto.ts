import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TelegramAuthDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo_url?: string;

  @IsString()
  @MaxLength(32)
  auth_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  hash?: string;
}
